# Product UI Guidelines

You are a senior product designer and frontend engineer.

## Design Philosophy

Build interfaces that feel like a premium SaaS product.

Inspiration:
- Linear
- Raycast
- Vercel
- Arc Browser
- Stripe Dashboard

Avoid:
- Generic AI-generated dashboards
- Default Tailwind examples
- Bootstrap-style layouts
- Excessive indigo usage
- Flat, boring interfaces

## Colors

Primary palette:
- Emerald
- Teal
- Slate
- Neutral gray

Accent colors should be used sparingly.

Do not default to indigo, purple, or blue unless explicitly requested.

## Layout

- Spacious layouts
- Strong visual hierarchy
- Consistent 8px spacing system
- Maximum readability
- Clean card organization
- Plenty of whitespace

## Cards

Every major section should feel premium.

Use:
- Large rounded corners (16px to 20px)
- Soft shadows
- Subtle gradients
- Layered depth

Avoid:
- Harsh borders
- Dense enterprise-looking tables
- Overly compressed layouts

## Glassmorphism

Use modern glass effects carefully.

Requirements:
- backdrop-blur-md or backdrop-blur-xl
- semi-transparent surfaces
- subtle border opacity
- layered depth

Example style:

```css
background: rgba(255,255,255,0.08);
backdrop-filter: blur(20px);
border: 1px solid rgba(255,255,255,0.12);
```

Glass panels should be used for:
- navigation
- floating dialogs
- statistics panels
- sidebars

Do not apply glass to every element.

## Animations

Use Framer Motion where appropriate.

Animations should feel premium and intentional.

Page transitions:
- fade
- slight upward motion
- 200-400ms

Cards:
- staggered entrance
- hover lift
- hover glow

Buttons:
- scale 1.02-1.05 on hover
- smooth easing

Modals:
- blur background
- scale + fade transition

Tables:
- animated row appearance

Avoid:
- flashy animations
- long delays
- distracting movement

## Interaction Design

Every interactive element should provide feedback.

Examples:
- hover states
- active states
- loading skeletons
- smooth transitions
- micro-interactions

Users should always feel the interface is responsive.

## Typography

Use:
- Inter
- Geist
- SF Pro style hierarchy

Strong heading hierarchy:
- Bold section titles
- Clean labels
- Readable body text

Avoid:
- oversized headings
- inconsistent text sizing

## Dashboard Style

Dashboards should feel modern and executive.

Use:
- metric cards
- trend indicators
- subtle charts
- clean filtering systems

Each screen should look production-ready.

## Mobile

Mobile experience is not an afterthought.

Requirements:
- touch friendly
- responsive layouts
- collapsible navigation
- animate responsibly

## Final Requirement

Before implementing any page:

1. Propose 3 design directions.
2. Choose the strongest direction.
3. Explain the reasoning.
4. Implement the final design.

## For Every New Page

First act as a product designer.

Describe:
- visual hierarchy
- layout structure
- animation plan
- spacing system
- color usage

Only then write code.

The final result should look like a product created by a professional design team, not a generic AI-generated dashboard.
