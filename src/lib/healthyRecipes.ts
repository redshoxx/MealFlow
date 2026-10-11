import type { Recipe } from './recipes';

export type HealthyRecipe = Recipe & { proteinGrams: number; calories: number; healthyCategory: string };

const data: Array<[string,string,number,number,number,string[],string,string]> = [
  [
    "Protein-Hähnchen-Bowl",
    "High Protein",
    35,
    510,
    48,
    [
      "150 g Hähnchenbrust",
      "70 g Vollkornreis (trocken)",
      "120 g Brokkoli",
      "1 Paprika",
      "1 TL Olivenöl",
      "Zitronensaft und Gewürze"
    ],
    "Reis nach Packungsanleitung garen. Hähnchen würzen und mit Öl durchbraten. Brokkoli und Paprika kurz dünsten. Alles in einer Bowl anrichten und mit Zitrone abschmecken.",
    "Viel Eiweiß mit Vollkornreis und Gemüse für ein ausgewogenes Mittag- oder Abendessen."
  ],
  [
    "Lachs mit Ofengemüse",
    "High Protein",
    35,
    530,
    40,
    [
      "160 g Lachsfilet",
      "150 g Kartoffeln",
      "150 g Zucchini",
      "100 g Karotten",
      "1 TL Olivenöl",
      "Kräuter, Salz und Pfeffer"
    ],
    "Backofen auf 200 °C vorheizen. Gemüse würfeln, mit Öl und Gewürzen vermengen und 20 Minuten backen. Lachs dazugeben und weitere 12–15 Minuten garen.",
    "Lachs liefert Eiweiß und Omega-3-Fettsäuren, buntes Gemüse ergänzt Ballaststoffe."
  ],
  [
    "Skyr-Beeren-Bowl",
    "Schnell & gesund",
    7,
    360,
    34,
    [
      "250 g Skyr natur",
      "100 g Beeren",
      "35 g Haferflocken",
      "10 g Nüsse",
      "1 TL Honig optional"
    ],
    "Skyr glatt rühren. Beeren waschen und mit Haferflocken und gehackten Nüssen darauf verteilen. Nach Wunsch leicht süßen.",
    "Ein schnelles Frühstück oder eine leichte Mahlzeit mit viel Eiweiß."
  ],
  [
    "Tofu-Quinoa-Pfanne",
    "Vegetarisch",
    25,
    490,
    29,
    [
      "180 g fester Tofu",
      "60 g Quinoa (trocken)",
      "100 g Spinat",
      "1 Paprika",
      "1 TL Öl",
      "Sojasauce und Ingwer"
    ],
    "Quinoa waschen und garen. Tofu würfeln und knusprig anbraten. Paprika und Spinat dazugeben. Mit Ingwer und etwas Sojasauce würzen, Quinoa unterheben.",
    "Pflanzliche Proteine, sättigende Körner und viel Gemüse."
  ],
  [
    "Hüttenkäse-Omelett",
    "High Protein",
    15,
    390,
    38,
    [
      "3 Eier",
      "120 g Hüttenkäse",
      "60 g Spinat",
      "1 Tomate",
      "1 TL Öl",
      "Pfeffer und Kräuter"
    ],
    "Eier verquirlen. Spinat und Tomaten kurz in einer Pfanne anbraten. Eier angießen, Hüttenkäse verteilen und bei mittlerer Hitze stocken lassen.",
    "Ein unkompliziertes warmes Gericht mit hohem Eiweißanteil."
  ],
  [
    "Linsen-Kichererbsen-Curry",
    "Ballaststoffreich",
    30,
    485,
    23,
    [
      "90 g rote Linsen (trocken)",
      "100 g Kichererbsen, gekocht",
      "150 g gehackte Tomaten",
      "100 g Karotten",
      "100 ml leichte Kokosmilch",
      "Currygewürz"
    ],
    "Linsen spülen. Karotten würfeln, mit Tomaten, Kokosmilch und Wasser aufkochen. Linsen 15 Minuten köcheln. Kichererbsen zugeben und kräftig würzen.",
    "Ein günstiges, sättigendes Curry mit Hülsenfrüchten und pflanzlichem Eiweiß."
  ],
  [
    "Puten-Wrap mit Joghurtdip",
    "Schnell & gesund",
    20,
    440,
    42,
    [
      "150 g Putenbrust",
      "1 Vollkorn-Wrap",
      "80 g griechischer Joghurt",
      "1 Handvoll Salat",
      "1 Tomate",
      "Gurke, Zitrone und Gewürze"
    ],
    "Putenbrust würzen und braten. Joghurt mit Zitronensaft und Kräutern verrühren. Wrap kurz erwärmen, mit Salat, Gemüse, Pute und Dip füllen.",
    "Praktisch für unterwegs, mit frischem Gemüse und viel Protein."
  ],
  [
    "Thunfisch-Bohnensalat",
    "High Protein",
    12,
    425,
    43,
    [
      "1 Dose Thunfisch im eigenen Saft, abgetropft",
      "140 g weiße Bohnen",
      "1 Tomate",
      "½ rote Zwiebel",
      "1 TL Olivenöl",
      "Zitronensaft und Petersilie"
    ],
    "Bohnen abspülen. Gemüse fein schneiden und alles mit dem Thunfisch vermengen. Mit Öl, Zitronensaft und Petersilie abschmecken.",
    "Ein frischer Salat ohne langes Kochen."
  ],
  [
    "Joghurt-Protein-Pancakes",
    "Frühstück",
    18,
    450,
    34,
    [
      "2 Eier",
      "120 g Skyr",
      "45 g Haferflocken",
      "½ Banane",
      "1 TL Backpulver",
      "Beeren zum Servieren"
    ],
    "Alle Zutaten außer den Beeren pürieren. Kleine Pancakes in einer beschichteten Pfanne ausbacken. Mit Beeren und etwas Skyr servieren.",
    "Süßes Frühstück mit mehr Eiweiß und sättigenden Haferflocken."
  ],
  [
    "Ofen-Feta mit Bohnen",
    "Vegetarisch",
    30,
    470,
    25,
    [
      "100 g Feta",
      "160 g weiße Bohnen",
      "150 g Kirschtomaten",
      "½ Zucchini",
      "1 TL Olivenöl",
      "Oregano und Pfeffer"
    ],
    "Bohnen, Gemüse und Feta in eine Auflaufform geben. Mit Öl und Gewürzen vermengen und bei 200 °C etwa 20–25 Minuten backen.",
    "Mediterran, schnell vorbereitet und sättigend."
  ]
];

export const HEALTHY_RECIPES: HealthyRecipe[] = data.map(([title, healthyCategory, minutes, calories, proteinGrams, ingredients, instructions, description], index) => ({
  id: `mealflow-healthy-${index + 1}`,
  title,
  healthyCategory,
  minutes,
  calories,
  proteinGrams,
  description,
  source: 'MealFlow',
  sourceKind: 'online',
  instructions,
  vegetarian: ['Vegetarisch', 'Ballaststoffreich'].includes(healthyCategory) || [2, 8].includes(index),
  ingredients: ingredients.map((name) => ({ name })),
  tags: [healthyCategory, 'Gesund'],
}));

export function searchHealthyRecipes(query: string): HealthyRecipe[] {
  const term = query.trim().toLocaleLowerCase('de-AT');
  if (!term) return HEALTHY_RECIPES;
  return HEALTHY_RECIPES.filter((recipe) =>
    [recipe.title, recipe.description || '', recipe.healthyCategory, ...recipe.ingredients.map((item) => item.name)]
      .some((value) => value.toLocaleLowerCase('de-AT').includes(term)),
  );
}

// Die Angaben sind Näherungswerte pro Portion; maßgeblich sind die tatsächlichen Zutaten und Mengen.
export const HEALTHY_NUTRITION_NOTE = 'Nährwerte sind ungefähre Richtwerte pro Portion.';
