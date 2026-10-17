import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import type { OfficialInteraction } from "../app/lib/analysis/types";
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

// saved medicines without their official product information ask for it in the background: never the real database here
test.beforeEach(async ({ page }) => {
  await page.route("**/api/official", (route) => route.fulfill({ json: { ok: true, official: null } }));
});

test.describe("home", () => {
  test("leads with one scan action, the watchlist and the way into Medicine Mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Know what works for your body.");
    await expect(page.getByRole("button", { name: "Scan a label" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My watchlist" })).toBeVisible();
    // Medicine Mode is a place of its own, kept when the page is opened again
    await page.getByRole("button", { name: "Open Medicine Mode" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Understand a medicine box.");
    await expect(page.locator("[data-mode]").first()).toHaveAttribute("data-mode", "medicine");
    await expect(page.getByText("It does not replace your pharmacist or your doctor.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Understand a medicine box.");
    await page.getByRole("button", { name: "Back to Food" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Know what works for your body.");
  });

  test("a photo taken in Medicine Mode tells the AI it is probably a medicine", async ({ page }) => {
    let mode: string | null = "";
    await page.route("**/api/analyze", async (route) => {
      // the multipart body, read as bytes: the photo and the text fields side by side
      const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
      mode = body.match(/name="mode"\r\n\r\n(\w+)/)?.[1] ?? null;
      await route.fulfill({ status: 503, json: { ok: false, error: "busy", code: "rate_limited" } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Open Medicine Mode" }).click();
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#fff" } }).png().toBuffer();
    await page.locator('input[type="file"]:not([capture])').first().setInputFiles({ name: "box.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("Analysis failed")).toBeVisible();
    expect(mode).toBe("medicine");
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
    await expect(page.getByRole("heading", { level: 1 })).toContainText("اعرف ما يناسب جسمك");
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

  test("a reading of the pen marks the app doubts is never drawn as the dose", async ({ page }) => {
    const unsure = medicine("m2", "Mycophil", ["terbinafine"], { marks: { morning: 1, midday: 0, evening: 1, confidence: "low" } });
    await withHistory(page, history(unsure));
    await page.goto("/");
    await open(page, "Mycophil");
    await expect(page.getByText("Uncertain reading").first()).toBeVisible();
    await expect(page.getByText(/Possible reading, not certain: .?Morning 1 · Evening 1/)).toBeVisible();
    await expect(page.getByText("a day in total")).toHaveCount(0);
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

  test("quotes what the official product information says about taking two medicines together", async ({ page }) => {
    const interactions: OfficialInteraction[] = [{ level: "not_recommended", with: "Anticoagulants oraux", text: "Augmentation du risque hémorragique de l'anticoagulant oral." }];
    await withHistory(page, history(medicine("a", "Advil", ["ibuprofen"], { official: { interactions } }), medicine("b", "Sintrom", ["acenocoumarol"], { official: { interactions: [] } })));
    await page.goto("/");
    await page.getByRole("button", { name: "My shelf" }).first().click();
    await expect(page.getByText("Ask before taking both")).toBeVisible();
    await expect(page.getByText("Not recommended", { exact: true })).toBeVisible();
    await expect(page.getByText(/Anticoagulants oraux : Augmentation du risque hémorragique/)).toBeVisible();
    await expect(page.getByRole("link", { name: /From the official product information of .ADVIL/ })).toBeVisible();
    // the app's own sentence for this pair gives way to the official one
    await expect(page.getByText(/an anti-inflammatory raises the risk of bleeding/)).toHaveCount(0);
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
  await page.getByRole("button", { name: "My watchlist", exact: true }).click();
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Lina");
  await page.getByRole("button", { name: "Milk" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /My watchlist: Lina/ })).toBeVisible();
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
    const switchControl = page.getByRole("switch", { name: "Use my watchlist and medicines" });
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
  // the name is isolated (U+2068…U+2069) so it can't reorder a right-to-left sentence
  await expect(page.getByText("For \u2068Lina\u2069")).toBeVisible();
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

test.describe("shelf mode", () => {
  // a camera and a barcode reader the test controls: two barcodes are always in view
  const fakeCamera = (page: Page) =>
    page.addInitScript(() => {
      const w = window as unknown as { BarcodeDetector: unknown };
      w.BarcodeDetector = class {
        async detect() {
          return [
            { rawValue: "3017620422003", boundingBox: { x: 60, y: 80, width: 200, height: 70 } },
            { rawValue: "5449000000996", boundingBox: { x: 320, y: 260, width: 200, height: 70 } },
          ];
        }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d")!;
        setInterval(() => {
          ctx.fillStyle = "#335";
          ctx.fillRect(0, 0, 640, 480);
        }, 50);
        return canvas.captureStream(20);
      };
    });
  const known = (name: string, fixture: string) => ({
    ok: true,
    result: fromFixture("p", fixture, { product: { name } }).result,
    meta: { model: "open-food-facts", provider: "database", attempts: 1, duration_ms: 1, locale: "en" },
  });

  test("puts a verdict on every barcode in view, and a tap opens the product", async ({ page }) => {
    await fakeCamera(page);
    await page.addInitScript(() =>
      localStorage.setItem("food-analyzer:profile:v2", JSON.stringify({ active: "me", profiles: [{ id: "me", name: "", allergens: ["milk"], lactose: false, sugar: false, diets: [] }] })),
    );
    const asked: string[] = [];
    await page.route("**/api/product*", async (route) => {
      const code = new URL(route.request().url()).searchParams.get("code")!;
      asked.push(code);
      await route.fulfill({ json: code === "3017620422003" ? known("Hazelnut spread", "eu-biscuit.txt") : known("Orange soda", "drink.txt") });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Scan a barcode" }).click();
    await page.getByRole("button", { name: "Scan a whole shelf" }).click();
    await expect(page.getByRole("dialog", { name: "Shelf mode" })).toBeVisible();
    // the milk in the first one is not in the second
    await expect(page.getByRole("button", { name: /Check|Avoid/ }).filter({ hasText: "Hazelnut spread" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nothing found/ }).filter({ hasText: "Orange soda" })).toBeVisible();
    // each barcode is asked for once, however long it stays in view
    await page.waitForTimeout(1200);
    expect([...asked].sort()).toEqual(["3017620422003", "5449000000996"]);
    await page.getByRole("button", { name: /Hazelnut spread/ }).click();
    await expect(page.getByRole("dialog", { name: "Shelf mode" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  });

  test("offers no shelf mode, only typing, when the camera is refused", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
        async detect() {
          return [];
        }
      };
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Scan a barcode" }).click();
    // the barcode scanner falls back to typing, and shelf mode is only offered over a live camera
    await expect(page.getByLabel("Or type the digits under the barcode")).toBeVisible();
    await expect(page.getByRole("button", { name: "Scan a whole shelf" })).toHaveCount(0);
  });

  test("without a profile it names the products and says how to get verdicts", async ({ page }) => {
    await fakeCamera(page);
    await page.route("**/api/product*", (route) => route.fulfill({ json: known("Orange soda", "drink.txt") }));
    await page.goto("/");
    await page.getByRole("button", { name: "Scan a barcode" }).click();
    await page.getByRole("button", { name: "Scan a whole shelf" }).click();
    await expect(page.getByRole("button", { name: "Orange soda" }).first()).toBeVisible();
    await expect(page.getByText("Add what you avoid to your watchlist")).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what works for your body.");
});

test.describe("a saved result follows the interface language", () => {
  const med = medicine("m1", "Paradol", ["paracetamol"], { marks: { morning: 1, midday: 0, evening: 1, confidence: "high" } });

  test("the app's own sentences switch at once, the AI's text is translated once and kept", async ({ page }) => {
    const sent: string[][] = [];
    await page.route("**/api/translate", async (route) => {
      const { texts } = route.request().postDataJSON() as { texts: string[] };
      sent.push(texts);
      await route.fulfill({ json: { ok: true, texts: texts.map((t) => `FR: ${t}`) } });
    });
    await withHistory(page, history(med));
    await page.goto("/");
    await open(page, "Paradol");
    await page.getByLabel("Language").selectOption("fr");
    // a sentence the app wrote itself, rebuilt in French without any model
    await expect(page.getByText("Les traits au stylo ont été lus par une IA")).toBeVisible();
    // the model's text, through the translation
    await expect(page.getByText("FR: pain")).toBeVisible();
    expect(sent).toHaveLength(1);
    // back to English: the phrasebook kept with the scan answers, no request
    await page.getByLabel("Langue").selectOption("en");
    await expect(page.getByText("The pen marks were read by an AI")).toBeVisible();
    await expect(page.getByText("pain", { exact: true })).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  test("a failed translation leaves the result readable and offers to try again", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/translate", (route) => {
      calls++;
      return route.fulfill({ status: 503, json: { ok: false, error: "busy", code: "rate_limited" } });
    });
    await withHistory(page, history(med));
    await page.goto("/");
    await open(page, "Paradol");
    await page.getByLabel("Language").selectOption("fr");
    await expect(page.getByText("la traduction n'a pas abouti")).toBeVisible();
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect.poll(() => calls).toBe(2);
  });
});

test("the same photo picked again opens its saved result without asking the AI", async ({ page }) => {
  let analyses = 0;
  const biscuit = fromFixture("b1", "eu-biscuit.txt");
  await page.route("**/api/analyze", async (route) => {
    analyses++;
    await route.fulfill({ json: { ok: true, result: biscuit.result, meta: { model: "m", provider: "p", attempts: 1, duration_ms: 900, locale: "en" } } });
  });
  // a small picture with something on it
  const png = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#f4f1ea" } })
    .composite([{ input: { create: { width: 40, height: 30, channels: 3, background: "#27624d" } }, top: 10, left: 20 }])
    .png()
    .toBuffer();
  const pick = () => page.locator('input[type="file"]:not([capture])').first().setInputFiles({ name: "label.png", mimeType: "image/png", buffer: png });
  await page.goto("/");
  await pick();
  // the home fades out as the result arrives, so its own h2 is no proof: wait for the analysis itself
  await expect.poll(() => analyses).toBe(1);
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.getByRole("button", { name: "LabelSight" }).first().click();
  await pick();
  await expect(page.getByText("You analyzed this exact photo before")).toBeVisible();
  expect(analyses).toBe(1);
});

test.describe("health conditions", () => {
  const withConditions = (page: Page, conditions: string[]) =>
    page.addInitScript(
      (list) =>
        localStorage.setItem(
          "food-analyzer:profile:v2",
          JSON.stringify({ active: "me", profiles: [{ id: "me", name: "", allergens: [], lactose: false, sugar: false, diets: [], conditions: list }] }),
        ),
      conditions,
    );

  test("are found by any of their names, and a medicine is checked against them", async ({ page }) => {
    await withHistory(page, history(medicine("a", "Brufen", ["ibuprofen"])));
    await page.goto("/");
    await page.getByRole("button", { name: "My watchlist", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search a health condition" }).fill("hémophilie");
    await page.getByRole("button", { name: "Haemophilia or a bleeding disorder" }).click();
    await expect(page.getByRole("button", { name: "Remove Haemophilia or a bleeding disorder" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await open(page, "Brufen");
    await expect(page.getByText("Avoid: ask your doctor or pharmacist", { exact: true })).toBeVisible();
    await expect(page.getByText("An anti-inflammatory (NSAID) or aspirin: it adds to the bleeding risk")).toBeVisible();
    await expect(page.getByText(/^Paracetamol is usually the pain reliever/)).toBeVisible();
  });

  test("send nothing to the AI until asked, then only the typed text, and wait for the reader's yes", async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route("**/api/conditions", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, ids: ["hemophilia"], others: [] } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "My watchlist", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search a health condition" }).fill("factor VIII deficiency");
    await expect(page.getByText("No condition in the list matches.")).toBeVisible();
    expect(bodies).toHaveLength(0);
    await page.getByRole("button", { name: "Understand with AI" }).click();
    await expect(page.getByText("The AI read this as:")).toBeVisible();
    expect(bodies).toEqual([{ text: "factor VIII deficiency", lang: "en" }]);
    // nothing is saved before the reader confirms
    await expect(page.getByRole("button", { name: "Remove Haemophilia or a bleeding disorder" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove Haemophilia or a bleeding disorder" })).toBeVisible();
  });

  test("the AI names a condition outside the list, which the reader adds as not checked", async ({ page }) => {
    await page.route("**/api/conditions", (route) => route.fulfill({ json: { ok: true, ids: [], others: [{ name: "Bipolar disorder", fr: "trouble bipolaire" }] } }));
    await page.goto("/");
    await page.getByRole("button", { name: "My watchlist", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search a health condition" }).fill("bipolar");
    await expect(page.getByRole("button", { name: "Keep as typed" })).toHaveCount(0);
    await page.getByRole("button", { name: "Understand with AI" }).click();
    await expect(page.getByText("The app has no rules for")).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove Bipolar disorder" })).toBeVisible();
  });

  test("what the AI finds no health condition in is not saved", async ({ page }) => {
    await page.route("**/api/conditions", (route) => route.fulfill({ json: { ok: true, ids: [], others: [] } }));
    await page.goto("/");
    await page.getByRole("button", { name: "My watchlist", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search a health condition" }).fill("banana");
    await page.getByRole("button", { name: "Understand with AI" }).click();
    await expect(page.getByText("The AI found no health condition in this. Nothing was added.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  });

  test("the shelf checks its medicines against them", async ({ page }) => {
    await withConditions(page, ["hemophilia"]);
    await withHistory(page, history(medicine("a", "Brufen", ["ibuprofen"]), medicine("b", "Doliprane", ["paracetamol"], { official: {} })));
    await page.goto("/");
    await page.getByRole("button", { name: "My shelf" }).first().click();
    const section = page.locator("section", { has: page.getByRole("heading", { name: "With your health conditions" }) });
    await expect(section).toBeVisible();
    await expect(section.getByText("Brufen")).toBeVisible();
    await expect(section.getByText("Doliprane")).toHaveCount(0);
  });

  test("a medicine is checked against its official product information, quoted with its source", async ({ page }) => {
    await withConditions(page, ["asthma"]);
    const contraindications = ["antécédents d'asthme déclenchés par la prise d'ibuprofène ou de substances d'activité proche,"];
    await withHistory(page, history(medicine("a", "Brufen", ["ibuprofen"], { official: { contraindications } }), medicine("b", "Panadol", ["paracetamol"])));
    await page.goto("/");
    await open(page, "Brufen");
    await expect(page.getByText("Contraindicated in its official product information")).toBeVisible();
    await expect(page.getByText(contraindications[0])).toBeVisible();
    await expect(page.getByRole("link", { name: /From the official product information of .BRUFEN/ })).toHaveAttribute("href", /base-donnees-publique\.medicaments\.gouv\.fr/);
  });

  test("a medicine whose official product information wasn't found is never 'nothing found'", async ({ page }) => {
    await withConditions(page, ["asthma"]);
    await withHistory(page, history(medicine("b", "Panadol", ["paracetamol"])));
    await page.goto("/");
    await open(page, "Panadol");
    await expect(page.getByText(/official product information wasn't found/)).toBeVisible();
    await expect(page.getByText("Nothing found for your health conditions")).toHaveCount(0);
  });
});
