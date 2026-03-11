// ── Meal Prep Tab ─────────────────────────────────────────────────
import { $ } from './utils.js';

const RECIPES = [
  {
    id: 'steak-eggs',
    title: 'Steak & Eggs',
    tag: 'Breakfast',
    tagClass: 'recipe-card__tag--magenta',
    source: { label: 'Maebells', url: 'https://www.maebells.com/steak-and-eggs/' },
    nutrition: { calories: 500, protein: 48, carbs: 1, fat: 35 },
    ingredients: [
      '6 oz sirloin steak',
      '3 large eggs',
      '1 tbsp butter',
      'Salt and pepper to taste',
    ],
    steps: [
      'Season steak generously with salt and pepper on both sides.',
      'Heat a cast iron skillet over medium-high heat. Add butter and let it melt and foam.',
      'Sear steak 3-4 minutes per side for medium (adjust to preference). Remove and rest 5 minutes, then slice against the grain.',
      'In the same pan with the steak drippings, fry 3 eggs to your liking.',
      'Plate sliced steak alongside the eggs. Season with a pinch of flaky salt.',
    ],
  },
  {
    id: 'chicken-thighs',
    title: 'Crispy Chicken Thighs & Roasted Broccoli',
    tag: 'Low Carb',
    tagClass: 'recipe-card__tag--green',
    source: { label: 'That Low Carb Life', url: 'https://thatlowcarblife.com/crispy-baked-chicken-thighs/' },
    nutrition: { calories: 500, protein: 42, carbs: 6, fat: 34 },
    ingredients: [
      '2 bone-in, skin-on chicken thighs',
      '1 tbsp olive oil',
      '1 tsp garlic powder',
      '1 tsp paprika',
      '1/2 tsp salt',
      '1/4 tsp black pepper',
      '2 cups broccoli florets',
      '1 tbsp olive oil (for broccoli)',
    ],
    steps: [
      'Preheat oven to 425\u00B0F. Pat chicken thighs dry with paper towels — this is key for crispy skin.',
      'Rub thighs with 1 tbsp olive oil, then season with garlic powder, paprika, salt, and pepper.',
      'Place skin-side up on a baking sheet. Bake 35-40 minutes until skin is golden and crispy, internal temp 165\u00B0F.',
      'Toss broccoli florets with 1 tbsp olive oil, salt, and pepper. Spread on a separate baking sheet.',
      'Roast broccoli alongside chicken for the last 20 minutes until edges are charred.',
      'Plate chicken thighs with roasted broccoli. Keeps 4-5 days refrigerated.',
    ],
  },
  {
    id: 'beef-broccoli',
    title: 'Keto Beef & Broccoli',
    tag: 'Stir-Fry',
    tagClass: '',
    source: { label: 'Noshtastic', url: 'https://www.noshtastic.com/keto-low-carb-beef-and-broccoli/' },
    nutrition: { calories: 480, protein: 42, carbs: 6, fat: 32 },
    ingredients: [
      '8 oz flat iron steak, sliced thin against the grain',
      '1/2 lb broccoli, cut into small florets',
      '2 tbsp coconut oil',
      '1/4 cup coconut aminos',
      '1 tsp toasted sesame oil',
      '1 tsp fish sauce',
      '1 tsp fresh ginger, grated',
      '2 cloves garlic, minced',
    ],
    steps: [
      'Slice steak very thin against the grain. Place in a bag with coconut aminos, ginger, and garlic. Marinate in the fridge for 1 hour.',
      'Drain beef from marinade, reserving the liquid for the sauce.',
      'Blanch broccoli in boiling water for 2 minutes, then drain thoroughly.',
      'Heat coconut oil in a wok or cast iron skillet over medium-high heat. Stir-fry beef until browned, 1-3 minutes. Remove from pan.',
      'Stir-fry broccoli 3 minutes until crisp-tender. Add reserved marinade and cook 2 more minutes.',
      'Return beef to pan, add fish sauce and sesame oil, toss to combine. Serve hot.',
    ],
  },
  {
    id: 'salmon-avocado',
    title: 'Salmon with Avocado Salsa',
    tag: 'Omega-3s',
    tagClass: 'recipe-card__tag--orange',
    source: { label: 'Gimme Delicious', url: 'https://gimmedelicious.com/grilled-salmon-with-avocado-salsa-healthy-low-carb-paleo-whole30/' },
    nutrition: { calories: 460, protein: 38, carbs: 8, fat: 32 },
    ingredients: [
      '6 oz salmon fillet',
      '1 tbsp olive oil',
      '1 clove garlic, minced',
      '1/2 tsp chili powder',
      '1/2 tsp cumin',
      '1/2 tsp onion powder',
      'Salt and pepper to taste',
      'Salsa: 1/2 avocado diced, 1/4 cup diced tomato, 1 tbsp diced onion, 1 tbsp cilantro, 1 tbsp lime juice, 1 tsp olive oil',
    ],
    steps: [
      'Mix 1 tbsp olive oil, garlic, chili powder, cumin, onion powder, salt, and pepper. Rub onto salmon fillet.',
      'Heat a heavy pan over medium-high heat. Sear salmon 5-6 minutes per side. (Or bake at 400\u00B0F for 12-15 minutes.)',
      'For the salsa: combine diced avocado, tomato, onion, and cilantro in a bowl. Drizzle with lime juice and olive oil, season with salt and pepper, gently toss.',
      'Plate salmon and top with avocado salsa. Serve immediately.',
    ],
  },
  {
    id: 'yogurt-bowl',
    title: 'Greek Yogurt & Nut Bowl',
    tag: 'No Cook',
    tagClass: 'recipe-card__tag--purple',
    source: { label: 'Like Hot Keto', url: 'https://likehotketo.com/peanut-butter-yogurt-protein-bowl' },
    nutrition: { calories: 420, protein: 35, carbs: 12, fat: 28 },
    ingredients: [
      '1.5 cups full-fat Greek yogurt',
      '2 tbsp natural peanut butter',
      '2 tbsp walnuts, chopped',
      '1 tbsp chia seeds',
    ],
    steps: [
      'Spoon Greek yogurt into a bowl.',
      'Stir in peanut butter until swirled throughout.',
      'Top with chopped walnuts and chia seeds.',
      'Eat immediately or refrigerate — keeps well for grab-and-go.',
    ],
  },
];

const SHOPPING_LIST = [
  {
    category: 'Proteins',
    items: [
      '6 oz sirloin steak (steak & eggs)',
      '8 oz flat iron steak (beef & broccoli)',
      '2 bone-in skin-on chicken thighs',
      '6 oz salmon fillet',
      '3 eggs',
      'Full-fat Greek yogurt (24 oz)',
    ],
  },
  {
    category: 'Produce',
    items: [
      '2 heads broccoli',
      '1 avocado',
      '1 tomato',
      '1 small onion',
      '1 head garlic',
      '1 piece fresh ginger',
      '1 lime',
      'Fresh cilantro (1 bunch)',
    ],
  },
  {
    category: 'Dairy & Eggs',
    items: [
      'Full-fat Greek yogurt (24 oz)',
      'Butter',
      '3 eggs',
    ],
  },
  {
    category: 'Pantry',
    items: [
      'Olive oil',
      'Coconut oil',
      'Sesame oil',
      'Coconut aminos',
      'Fish sauce',
      'Natural peanut butter',
      'Chia seeds',
      'Walnuts',
    ],
  },
  {
    category: 'Spices',
    items: [
      'Garlic powder',
      'Paprika',
      'Chili powder',
      'Cumin',
      'Onion powder',
      'Salt',
      'Black pepper',
    ],
  },
];

function getDailyTotals() {
  let cal = 0, pro = 0, carb = 0, fat = 0;
  for (const r of RECIPES) {
    cal += r.nutrition.calories;
    pro += r.nutrition.protein;
    carb += r.nutrition.carbs;
    fat += r.nutrition.fat;
  }
  return { cal, pro, carb, fat };
}

function renderRecipes() {
  const totals = getDailyTotals();
  return `
    <div class="mealprep-daily-summary">
      <span class="mealprep-daily-summary__label">Daily Totals</span>
      <span class="mealprep-daily-summary__stat">${totals.cal.toLocaleString()} cal</span>
      <span class="mealprep-daily-summary__divider">&middot;</span>
      <span class="mealprep-daily-summary__stat mealprep-daily-summary__stat--protein">${totals.pro}g protein</span>
      <span class="mealprep-daily-summary__divider">&middot;</span>
      <span class="mealprep-daily-summary__stat">${totals.carb}g carbs</span>
      <span class="mealprep-daily-summary__divider">&middot;</span>
      <span class="mealprep-daily-summary__stat">${totals.fat}g fat</span>
    </div>
    <div class="mealprep-recipes">
      ${RECIPES.map(r => `
        <div class="recipe-card" data-recipe="${r.id}">
          <div class="recipe-card__header">
            <div class="recipe-card__header-content">
              <div class="recipe-card__title">
                ${r.title}
                <span class="recipe-card__tag ${r.tagClass}">${r.tag}</span>
              </div>
              <div class="recipe-card__macros">
                <span class="recipe-card__macro recipe-card__macro--protein">${r.nutrition.protein}g protein</span>
                <span class="recipe-card__macro">${r.nutrition.calories} cal</span>
                <span class="recipe-card__macro">${r.nutrition.carbs}g C</span>
                <span class="recipe-card__macro">${r.nutrition.fat}g F</span>
              </div>
            </div>
            <span class="recipe-card__chevron">\u25B6</span>
          </div>
          <div class="recipe-card__body">
            ${r.source ? `<a class="recipe-card__source" href="${r.source.url}" target="_blank" rel="noopener">${r.source.label} &#8599;</a>` : ''}
            <div class="recipe-card__section">
              <div class="recipe-card__section-title">Ingredients</div>
              <ul class="recipe-card__list">
                ${r.ingredients.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            <div class="recipe-card__section">
              <div class="recipe-card__section-title">Instructions</div>
              <ol class="recipe-card__steps">
                ${r.steps.map(s => `<li>${s}</li>`).join('')}
              </ol>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderShopping() {
  return `
    <div class="shopping-list">
      ${SHOPPING_LIST.map((cat, ci) => `
        <div class="shopping-category">
          <div class="shopping-category__title">${cat.category}</div>
          <ul class="shopping-category__items">
            ${cat.items.map((item, ii) => {
              const id = `shop-${ci}-${ii}`;
              return `<li>
                <input type="checkbox" id="${id}">
                <label for="${id}">${item}</label>
              </li>`;
            }).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;
}

export function init() {
  const panel = $('#mealprep-panel');
  if (!panel) return;

  const totals = getDailyTotals();
  panel.innerHTML = `
    <h1>Weekly Meal Prep</h1>
    <p class="mealprep-subtitle">5 meals · ${totals.cal.toLocaleString()} cal · ${totals.pro}g protein · ${totals.carb}g carbs per day</p>
    <div class="mealprep-toggle">
      <button class="mealprep-toggle__btn mealprep-toggle__btn--active" data-view="recipes">Recipes</button>
      <button class="mealprep-toggle__btn" data-view="shopping">Shopping List</button>
    </div>
    <div id="mealprep-view">${renderRecipes()}</div>
  `;

  for (const btn of panel.querySelectorAll('.mealprep-toggle__btn')) {
    btn.addEventListener('click', () => {
      for (const b of panel.querySelectorAll('.mealprep-toggle__btn')) {
        b.classList.remove('mealprep-toggle__btn--active');
      }
      btn.classList.add('mealprep-toggle__btn--active');
      const view = btn.dataset.view;
      const container = $('#mealprep-view');
      container.innerHTML = view === 'recipes' ? renderRecipes() : renderShopping();
      if (view === 'recipes') bindRecipeCards();
      if (view === 'shopping') bindCheckboxes();
    });
  }

  bindRecipeCards();
}

function bindRecipeCards() {
  for (const card of document.querySelectorAll('.recipe-card')) {
    card.querySelector('.recipe-card__header').addEventListener('click', () => {
      card.classList.toggle('recipe-card--open');
    });
  }
}

function bindCheckboxes() {
  for (const cb of document.querySelectorAll('.shopping-category__items input[type="checkbox"]')) {
    cb.addEventListener('change', () => {
      const label = cb.nextElementSibling;
      label.classList.toggle('checked', cb.checked);
    });
  }
}
