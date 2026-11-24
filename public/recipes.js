const cookidoo = 'https://cookidoo.pl/recipes/recipe/pl-PL/';

const recipes = [
  { id: 'r766218', name: 'Makaron z kurczakiem i suszonymi pomidorami', ingredients: [/\bmakaron\w*\b/, /\bkurczak\w*\b/, /\bsuszone pomidory\b/, /\bsmietan\w*\b/] },
  { id: 'r536745', name: 'Kurczak z warzywnym ryżem', ingredients: [/\bkurczak\w*\b/, /\bryz\w*\b/, /\bmarchew\w*\b/, /\bcukini\w*\b/, /\bpapryk\w*\b/] },
  { id: 'r55327', name: 'Placki ziemniaczane', ingredients: [/\bziemniak\w*\b/, /\bcebul\w*\b/, /\bjaj(?:a|k\w*)\b/] },
  { id: 'r55275', name: 'Naleśniki', ingredients: [/\bmlek\w*\b/, /\bmak[ai]\b/, /\bjaj(?:a|k\w*)\b/] },
  { id: 'r323213', name: 'Owsianka zbożowa z jabłkiem i mlekiem', ingredients: [/\bplatk\w* owsian\w*\b/, /\bjablk\w*\b/, /\bmlek\w*\b/] },
  { id: 'r90518', name: 'Krem marchewkowo-imbirowy z soczewicą', ingredients: [/\bmarchew\w*\b/, /\bimbir\w*\b/, /\bsoczewic\w*\b/] },
  { id: 'r913453', name: 'Spaghetti Bolognese', ingredients: [/\b(?:spaghetti|makaron)\w*\b/, /\bmies[oa] mielon\w*\b/] },
  { id: 'r55309', name: 'Makaron w sosie pomidorowym', ingredients: [/\bmakaron\w*\b/, /\bsos pomidorowy\b/, /\bchorizo\b/, /\bpieczark\w*\b/] },
  { id: 'r323228', name: 'Koktajl owocowy z sokiem pomarańczowym', ingredients: [/\bpomarancz\w*\b/] },
];

function normalized(name) {
  return name.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ł', 'l');
}

export function suggestRecipes(items) {
  const products = items.filter((item) => item.category !== 'home')
    .map((item) => ({ name: item.name, search: normalized(item.name) }));

  return recipes.map((recipe) => {
    const matched = new Set();
    for (const ingredient of recipe.ingredients) {
      const product = products.find((item) => ingredient.test(item.search));
      if (product) matched.add(product.name);
    }
    return { name: recipe.name, url: cookidoo + recipe.id, matched: [...matched] };
  }).filter((recipe) => recipe.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length)
    .slice(0, 3);
}
