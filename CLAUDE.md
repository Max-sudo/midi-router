# CLAUDE.md — Project Instructions

## Screenshot Iterative Improvement Protocol

When the user asks for UI improvements, or when analyzing a page/component, use the self-driven screenshot loop below.

### Screenshot Capture

Use Puppeteer to capture the current state:
```bash
node scripts/screenshot.js http://localhost:8000 screenshot.png
```
Then read the resulting image to analyze it visually.

### Iteration Loop (3–5 rounds)

#### 1. Capture
Run the screenshot script to get the current state of the page.

#### 2. Analyze
Examine the screenshot for:
- Layout problems (alignment, overflow, clipping, spacing — measure in px)
- Visual clarity (contrast, hierarchy, readability)
- Usability (affordances, touch targets, discoverability)
- Styling consistency with design system (`css/variables.css`)
- Font sizes/weights, colors (exact hex), border radii, shadows
- Responsive behavior, icon sizing/placement
- Be specific: e.g., "gap between cards is 8px, should be 16px"

#### 3. Improve
Implement fixes directly in the codebase. State what changed and why for each fix.

#### 4. Re-capture
Screenshot again. Compare against the previous capture. Note what improved and what remains.

#### 5. Repeat
Continue until 5 iterations are reached OR improvements become marginal.

### Rules
- Minimum **3** iterations, maximum **5**
- Each iteration must make **meaningful** improvements (not cosmetic-only)
- Always **read existing code** before modifying it
- The user may provide direction at any point — incorporate it immediately
- Do not add features, sections, or content not present — focus on improving what exists

### Final Output
1. Summary of all improvements made across iterations
2. Optional: suggested next improvements if another pass were warranted
