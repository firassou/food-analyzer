import { expect, test, type Page } from "@playwright/test";
import { fromFixture, HISTORY_KEY, history, medicine, monthsFromNow } from "./seed";

/** saved scans in place before the page first loads (a reload keeps what the app saved since) */
const withHistory = (page: Page, json: string) =>
  page.addInitScript(
    ([key, value]) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [HISTORY_KEY, json],
  );

const open = (page: Page, name: string) => page.getByRole("button", { name: `Open ${name}` }).click();

test.describe("home", () => {
  test("shows the headline with a rotating word that changes", async ({ page }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("Know what's really in your");
    const visible = () => heading.locator("span[aria-hidden]").last().innerText();
    const first = await visible();
    await expect.poll(visible, { timeout: 8000 }).not.toBe(first);
  });

  test("the paste hint is for desktops only", async ({ page, isMobile }) => {
    await page.goto("/");
    const hint = page.getByText("paste one with");
    if (isMobile) await expect(hint).toBeHidden();
    else await expect(hint).toBeVisible();
  });

  test("loads with no console errors (the content-security policy blocks nothing)", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("Arabic is right-to-left", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "lang", value: "ar", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("اعرف");
  });
});

test.describe("security", () => {
  test("sets a nonce-based policy and the other headers", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[\w+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
  });

  test("refuses a cross-site POST and never caches the API", async ({ request }) => {
    const res = await request.post("/api/ask", { headers: { origin: "https://evil.example" }, data: { question: "hi", result: {} } });
    expect(res.status()).toBe(403);
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("the health check doesn't list models", async ({ request }) => {
    const body = await (await request.get("/api/analyze")).json();
    expect(body).not.toHaveProperty("models");
    expect(body).not.toHaveProperty("providers");
  });
});

test.describe("a medicine", () => {
  const med = medicine("m1", "Paradol", ["paracetamol"], { marks: { morning: 1, midday: 0, evening: 1, confidence: "high" } });

  test("can be asked about, and the answer is marked as general information", async ({ page }) => {
    let asked = "";
    await page.route("**/api/ask", async (route) => {
      asked = route.request().postDataJSON().question;
      await route.fulfill({ json: { ok: true, answer: "[G] It relieves pain and fever.", model: "m", provider: "p" } });
    });
    await withHistory(page, history(med));
    await page.goto("/");
    await open(page, "Paradol");
    await page.getByRole("button", { name: "What is it used for?" }).click();
    await expect(page.getByText("It relieves pain and fever.")).toBeVisible();
    await expect(page.getByRole("log").getByText("General information")).toBeVisible();
    expect(asked).toBe("What is it used for?");
  });

  test("its pen marks can be corrected by the reader", async ({ page }) => {
    await withHistory(page, history(med));
    await page.goto("/");
    await open(page, "Paradol");
    await expect(page.getByText("Marked on your box")).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Fewer: Morning" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Entered by you")).toBeVisible();
    // it is kept with the scan
    await page.reload();
    await open(page, "Paradol");
    await expect(page.getByText("Entered by you")).toBeVisible();
  });
});

test("an additive has its own Ask AI button", async ({ page }) => {
  let asked = "";
  await page.route("**/api/ask", async (route) => {
    asked = route.request().postDataJSON().question;
    await route.fulfill({ json: { ok: true, answer: "[G] An acidity regulator.", model: "m", provider: "p" } });
  });
  await withHistory(page, history(fromFixture("d1", "drink.txt")));
  await page.goto("/");
  await open(page, "Sparkling Orange");
  await page
    .getByRole("button", { name: /^Ask AI about/ })
    .first()
    .click();
  await expect(page.getByText("An acidity regulator.")).toBeVisible();
  expect(asked).toMatch(/^What is .*\(E\d+[a-z]*\)\?/);
});

test.describe("the shelf", () => {
  test("lists dates and checks the medicines against each other", async ({ page }) => {
    await withHistory(
      page,
      history(
        medicine("a", "Brufen", ["ibuprofen"], { expiration: monthsFromNow(-2) }),
        medicine("b", "Sintrom", ["acenocoumarol"], { expiration: monthsFromNow(0) }),
        medicine("c", "Spasfon", ["phloroglucinol"], { expiration: monthsFromNow(40) }),
      ),
    );
    await page.goto("/");
    await expect(page.getByText(/on your shelf expired or expire soon/)).toBeVisible();
    await page.getByRole("button", { name: "My shelf" }).first().click();
    await expect(page.getByText("Expired", { exact: true })).toBeVisible();
    await expect(page.getByText("Ask before taking both")).toBeVisible();
    await expect(page.getByText("Brufen + Sintrom")).toBeVisible();
  });

  test("shows how long a treatment still runs, from the duration the pharmacist wrote", async ({ page }) => {
    const marks = { morning: 1, midday: 0, evening: 1, confidence: "high", duration: "7 jours" };
    await withHistory(page, history(medicine("a", "Augmentin", ["amoxicillin"], { marks }), medicine("b", "Doliprane", ["paracetamol"])));
    await page.goto("/");
    await page.getByRole("button", { name: "My shelf" }).first().click();
    await expect(page.getByRole("heading", { name: "Treatments" })).toBeVisible();
    await expect(page.getByText("Augmentin")).toBeVisible();
    await expect(page.getByText("6 days left")).toBeVisible();
    await expect(page.getByText("2 a day")).toBeVisible();
    // a medicine with no duration written on it isn't listed as a treatment
    await expect(page.getByRole("button", { name: /Doliprane.*days left/ })).toHaveCount(0);
  });

  test("has no treatments section when no duration was written", async ({ page }) => {
    await withHistory(page, history(medicine("a", "Doliprane", ["paracetamol"])));
    await page.goto("/");
    await page.getByRole("button", { name: "My shelf" }).first().click();
    await expect(page.getByRole("heading", { name: "Medicines together" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Treatments" })).toHaveCount(0);
  });
});

test("several people can share the device", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My profile" }).click();
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Lina");
  await page.getByRole("button", { name: "Milk" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /My profile: Lina/ })).toBeVisible();
});

test.describe("Ask AI and what it may know about the reader", () => {
  const answer = { ok: true, answer: "Fine.", model: "m", provider: "p" };
  const withProfile = (page: Page) =>
    page.addInitScript(() =>
      localStorage.setItem(
        "food-analyzer:profile:v2",
        JSON.stringify({ active: "me", profiles: [{ id: "me", name: "", allergens: ["milk"], lactose: false, sugar: false, diets: [] }] }),
      ),
    );
  /** asks a question and waits until the `n`th answer is on the page */
  const ask = async (page: Page, question: string, n: number) => {
    await page.getByRole("textbox", { name: "Ask about this product…" }).fill(question);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Fine.")).toHaveCount(n);
  };

  test("sends nothing about the reader until they turn it on", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/ask", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ json: answer });
    });
    await withProfile(page);
    await withHistory(page, history(fromFixture("n1", "eu-biscuit.txt", { product: { name: "Biscuit" } })));
    await page.goto("/");
    await open(page, "Biscuit");
    const switchControl = page.getByRole("switch", { name: "Use my profile and medicines" });
    await expect(switchControl).toHaveAttribute("aria-checked", "false");
    await ask(page, "Is this fine for me?", 1);
    expect(bodies[0].context).toBeUndefined();

    await switchControl.click();
    await expect(switchControl).toHaveAttribute("aria-checked", "true");
    await ask(page, "And now?", 2);
    const context = bodies[1].context as { reader: string[]; checks: string[] };
    expect(context.reader[0]).toBe("The reader is allergic or intolerant to milk.");
    expect(context.checks[0]).toMatch(/^Profile check for this product:/);
  });

  test("is not offered when there is nothing to tell", async ({ page }) => {
    await withHistory(page, history(fromFixture("n1", "eu-biscuit.txt", { product: { name: "Biscuit" } })));
    await page.goto("/");
    await open(page, "Biscuit");
    await expect(page.getByRole("textbox", { name: "Ask about this product…" })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });
});

test("a result shows what it means for everyone who shares the device", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "food-analyzer:profile:v2",
      JSON.stringify({
        active: "me",
        profiles: [
          { id: "me", name: "", allergens: ["milk"], lactose: false, sugar: false, diets: [] },
          { id: "lina", name: "Lina", allergens: ["fish"], lactose: false, sugar: false, diets: [] },
        ],
      }),
    ),
  );
  await withHistory(page, history(fromFixture("n1", "eu-biscuit.txt", { product: { name: "Biscuit" } })));
  await page.goto("/");
  await open(page, "Biscuit");
  const everyone = page.getByRole("button", { name: /^Lina/ });
  await expect(everyone).toContainText("Nothing found");
  await expect(page.getByRole("button", { name: /^Me/ })).toContainText("Check");
  await everyone.click();
  await expect(page.getByText("For Lina")).toBeVisible();
});

test.describe("food and the medicines on the shelf", () => {
  const juice = (name: string) => fromFixture("d1", "drink.txt", { product: { name }, ingredients: [{ name: "Grapefruit juice" }, { name: "Water" }] });

  test("a product that stands out against a scanned medicine says so", async ({ page }) => {
    await withHistory(page, history(juice("Pink Juice"), medicine("m1", "Zocor", ["simvastatin"])));
    await page.goto("/");
    await open(page, "Pink Juice");
    await expect(page.getByText("With your medicines")).toBeVisible();
    await expect(page.getByText(/^Zocor/)).toBeVisible();
    await expect(page.getByText(/Contains grapefruit\. It can raise the level of/)).toBeVisible();
  });

  test("shows nothing when no medicine is concerned", async ({ page }) => {
    await withHistory(page, history(juice("Pink Juice"), medicine("m1", "Doliprane", ["paracetamol"])));
    await page.goto("/");
    await open(page, "Pink Juice");
    await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
    await expect(page.getByText("With your medicines")).toHaveCount(0);
  });
});

test("a result can be shared as text without anything personal", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown }).__shared = null;
    navigator.share = async (data) => {
      (window as unknown as { __shared: unknown }).__shared = data;
    };
  });
  await withHistory(page, history(fromFixture("b1", "eu-biscuit.txt")));
  await page.goto("/");
  await open(page, "Choc Chip Hazelnut Cookies");
  await page.getByRole("button", { name: "Share" }).click();
  const shared = (await page.evaluate(() => (window as unknown as { __shared: { text: string } }).__shared)) as { text: string };
  expect(shared.text).toContain("Choc Chip Hazelnut Cookies");
  expect(shared.text).not.toMatch(/for your profile/i);
});

test.describe("better choices", () => {
  // two candidates: one plain, one with milk (the same fixture, with its ingredients replaced)
  const plain = fromFixture("alt1", "drink.txt").result;
  const milky = fromFixture("alt2", "eu-biscuit.txt", {
    ingredients: [{ name: "Skimmed milk powder", name_en: "skimmed milk powder", allergens: ["milk"] }],
  }).result;
  const item = (code: string, name: string, result: typeof plain) => ({ code, name, brand: "Brand", grade: "b", sugar: 4, result });
  const answer = (items: unknown[]) => ({ ok: true, category: "en:sweet-spreads", country: "TN", own: { grade: "e", sugar: 56 }, items });
  const spread = () => history(fromFixture("n1", "eu-biscuit.txt", { product: { name: "Spread", barcode: "3017620422003" } }));

  test.describe("in Tunisia", () => {
    test.use({ timezoneId: "Africa/Tunis" });

    test("are asked for the reader's country and shown when something is found", async ({ page }) => {
      let requested = "";
      await page.route("**/api/alternatives*", async (route) => {
        requested = route.request().url();
        await route.fulfill({ json: answer([item("3760020507350", "Pur beurre de cacahuète", plain)]) });
      });
      await withHistory(page, spread());
      await page.goto("/");
      await open(page, "Spread");
      await expect(page.getByText("Pur beurre de cacahuète")).toBeVisible();
      await expect(page.getByText(/sold in Tunisia/)).toBeVisible();
      expect(new URL(requested).searchParams.get("country")).toBe("TN");
    });

    test("leave out what contains what the reader avoids", async ({ page }) => {
      await page.route("**/api/alternatives*", (route) =>
        route.fulfill({ json: answer([item("1111111111111", "Milky Spread", milky), item("2222222222222", "Plain Spread", plain)]) }),
      );
      await page.addInitScript(() =>
        localStorage.setItem(
          "food-analyzer:profile:v2",
          JSON.stringify({
            active: "me",
            profiles: [{ id: "me", name: "", allergens: ["milk"], lactose: false, sugar: false, diets: [] }],
          }),
        ),
      );
      await withHistory(page, spread());
      await page.goto("/");
      await open(page, "Spread");
      await expect(page.getByText("Plain Spread")).toBeVisible();
      await expect(page.getByText("Milky Spread")).toBeHidden();
      await expect(page.getByText("Anything with what you avoid is left out.")).toBeVisible();
    });

    test("are not shown at all when nothing is found", async ({ page }) => {
      await page.route("**/api/alternatives*", (route) => route.fulfill({ json: answer([]) }));
      await withHistory(page, spread());
      await page.goto("/");
      await open(page, "Spread");
      await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Better choices" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Better choices" })).toHaveCount(0);
    });

    test("are not shown when nothing fits the profile or the database can't be reached", async ({ page }) => {
      await page.route("**/api/alternatives*", (route) =>
        route.fulfill({ status: 502, json: { ok: false, error: "down", code: "upstream_unavailable" } }),
      );
      await withHistory(page, spread());
      await page.goto("/");
      await open(page, "Spread");
      await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Better choices" })).toHaveCount(0);
    });
  });

  test.describe("with no country to go on", () => {
    test.use({ locale: "en", timezoneId: "UTC" });
    test("nothing is asked and nothing is shown", async ({ page }) => {
      let asked = 0;
      await page.route("**/api/alternatives*", (route) => {
        asked++;
        return route.fulfill({ json: answer([item("3760020507350", "Anything", plain)]) });
      });
      await withHistory(page, spread());
      await page.goto("/");
      await open(page, "Spread");
      await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
      expect(asked).toBe(0);
      await expect(page.getByText("Anything", { exact: true })).toHaveCount(0);
    });
  });
});

test("the app opens offline once it has been visited", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // the first visit isn't controlled by the worker: a second one fills and uses its cache
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what's really in your");
});
