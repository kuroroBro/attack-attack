// Generates js/trivia.js — 1000 general-knowledge questions, 4 choices each.
// Run: node tools/gen-trivia.js   (writes ../js/trivia.js, deterministic)
//
// Output format: [{ q, a, d: [d1, d2, d3] }] — `a` is the correct answer,
// `d` are distractors. The Host shuffles a+d when serving a question, so
// answer position carries no signal.

const fs = require("fs");
const path = require("path");

// Deterministic RNG so regeneration produces a stable file
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260703);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function sample(arr, n, exclude = new Set()) {
  const out = [];
  const seen = new Set(exclude);
  let guard = 0;
  while (out.length < n && guard++ < 10000) {
    const v = pick(arr);
    if (!seen.has(String(v))) {
      seen.add(String(v));
      out.push(v);
    }
  }
  return out;
}

const questions = [];
const seenQ = new Set();
function add(q, a, d) {
  if (seenQ.has(q)) return;
  d = [...new Set(d.map(String))].filter((x) => x !== String(a)).slice(0, 3);
  if (d.length < 3) return;
  seenQ.add(q);
  questions.push({ q, a: String(a), d });
}

// ---------------------------------------------------------------- countries
// [country, capital, continent, currency?]
const COUNTRIES = [
  ["Philippines", "Manila", "Asia", "Peso"],
  ["Japan", "Tokyo", "Asia", "Yen"],
  ["China", "Beijing", "Asia", "Yuan"],
  ["South Korea", "Seoul", "Asia", "Won"],
  ["North Korea", "Pyongyang", "Asia"],
  ["India", "New Delhi", "Asia", "Rupee"],
  ["Indonesia", "Jakarta", "Asia", "Rupiah"],
  ["Thailand", "Bangkok", "Asia", "Baht"],
  ["Vietnam", "Hanoi", "Asia", "Dong"],
  ["Malaysia", "Kuala Lumpur", "Asia", "Ringgit"],
  ["Singapore", "Singapore", "Asia"],
  ["Cambodia", "Phnom Penh", "Asia", "Riel"],
  ["Laos", "Vientiane", "Asia", "Kip"],
  ["Myanmar", "Naypyidaw", "Asia", "Kyat"],
  ["Brunei", "Bandar Seri Begawan", "Asia"],
  ["Mongolia", "Ulaanbaatar", "Asia"],
  ["Nepal", "Kathmandu", "Asia"],
  ["Bangladesh", "Dhaka", "Asia", "Taka"],
  ["Sri Lanka", "Colombo", "Asia"],
  ["Pakistan", "Islamabad", "Asia"],
  ["Afghanistan", "Kabul", "Asia"],
  ["Iran", "Tehran", "Asia", "Rial"],
  ["Iraq", "Baghdad", "Asia"],
  ["Saudi Arabia", "Riyadh", "Asia", "Riyal"],
  ["Israel", "Jerusalem", "Asia", "Shekel"],
  ["Jordan", "Amman", "Asia"],
  ["Lebanon", "Beirut", "Asia"],
  ["Syria", "Damascus", "Asia"],
  ["Turkey", "Ankara", "Asia", "Lira"],
  ["United Arab Emirates", "Abu Dhabi", "Asia", "Dirham"],
  ["Qatar", "Doha", "Asia"],
  ["Kuwait", "Kuwait City", "Asia"],
  ["Kazakhstan", "Astana", "Asia", "Tenge"],
  ["Uzbekistan", "Tashkent", "Asia"],
  ["Taiwan", "Taipei", "Asia"],
  ["France", "Paris", "Europe", "Euro"],
  ["Germany", "Berlin", "Europe", "Euro"],
  ["Italy", "Rome", "Europe", "Euro"],
  ["Spain", "Madrid", "Europe", "Euro"],
  ["Portugal", "Lisbon", "Europe", "Euro"],
  ["United Kingdom", "London", "Europe", "Pound sterling"],
  ["Ireland", "Dublin", "Europe", "Euro"],
  ["Netherlands", "Amsterdam", "Europe", "Euro"],
  ["Belgium", "Brussels", "Europe", "Euro"],
  ["Switzerland", "Bern", "Europe", "Swiss franc"],
  ["Austria", "Vienna", "Europe", "Euro"],
  ["Greece", "Athens", "Europe", "Euro"],
  ["Sweden", "Stockholm", "Europe", "Krona"],
  ["Norway", "Oslo", "Europe", "Krone"],
  ["Denmark", "Copenhagen", "Europe", "Krone"],
  ["Finland", "Helsinki", "Europe", "Euro"],
  ["Iceland", "Reykjavik", "Europe", "Krona"],
  ["Poland", "Warsaw", "Europe", "Zloty"],
  ["Czech Republic", "Prague", "Europe", "Koruna"],
  ["Slovakia", "Bratislava", "Europe"],
  ["Hungary", "Budapest", "Europe", "Forint"],
  ["Romania", "Bucharest", "Europe", "Leu"],
  ["Bulgaria", "Sofia", "Europe"],
  ["Serbia", "Belgrade", "Europe"],
  ["Croatia", "Zagreb", "Europe"],
  ["Slovenia", "Ljubljana", "Europe"],
  ["Ukraine", "Kyiv", "Europe", "Hryvnia"],
  ["Russia", "Moscow", "Europe", "Ruble"],
  ["Belarus", "Minsk", "Europe"],
  ["Lithuania", "Vilnius", "Europe"],
  ["Latvia", "Riga", "Europe"],
  ["Estonia", "Tallinn", "Europe"],
  ["Albania", "Tirana", "Europe"],
  ["North Macedonia", "Skopje", "Europe"],
  ["Bosnia and Herzegovina", "Sarajevo", "Europe"],
  ["Luxembourg", "Luxembourg City", "Europe"],
  ["Malta", "Valletta", "Europe"],
  ["Cyprus", "Nicosia", "Europe"],
  ["Egypt", "Cairo", "Africa", "Egyptian pound"],
  ["Nigeria", "Abuja", "Africa", "Naira"],
  ["South Africa", "Pretoria", "Africa", "Rand"],
  ["Kenya", "Nairobi", "Africa", "Shilling"],
  ["Ethiopia", "Addis Ababa", "Africa", "Birr"],
  ["Morocco", "Rabat", "Africa", "Dirham"],
  ["Algeria", "Algiers", "Africa", "Dinar"],
  ["Tunisia", "Tunis", "Africa"],
  ["Libya", "Tripoli", "Africa"],
  ["Ghana", "Accra", "Africa", "Cedi"],
  ["Senegal", "Dakar", "Africa"],
  ["Ivory Coast", "Yamoussoukro", "Africa"],
  ["Cameroon", "Yaounde", "Africa"],
  ["Democratic Republic of the Congo", "Kinshasa", "Africa"],
  ["Uganda", "Kampala", "Africa"],
  ["Tanzania", "Dodoma", "Africa"],
  ["Zimbabwe", "Harare", "Africa"],
  ["Zambia", "Lusaka", "Africa", "Kwacha"],
  ["Mozambique", "Maputo", "Africa"],
  ["Angola", "Luanda", "Africa"],
  ["Sudan", "Khartoum", "Africa"],
  ["Madagascar", "Antananarivo", "Africa"],
  ["Botswana", "Gaborone", "Africa", "Pula"],
  ["Namibia", "Windhoek", "Africa"],
  ["Rwanda", "Kigali", "Africa"],
  ["Somalia", "Mogadishu", "Africa"],
  ["United States", "Washington, D.C.", "North America", "US dollar"],
  ["Canada", "Ottawa", "North America", "Canadian dollar"],
  ["Mexico", "Mexico City", "North America", "Peso"],
  ["Cuba", "Havana", "North America"],
  ["Jamaica", "Kingston", "North America"],
  ["Haiti", "Port-au-Prince", "North America", "Gourde"],
  ["Dominican Republic", "Santo Domingo", "North America"],
  ["Guatemala", "Guatemala City", "North America", "Quetzal"],
  ["Honduras", "Tegucigalpa", "North America", "Lempira"],
  ["Nicaragua", "Managua", "North America", "Cordoba"],
  ["Costa Rica", "San Jose", "North America", "Colon"],
  ["Panama", "Panama City", "North America", "Balboa"],
  ["El Salvador", "San Salvador", "North America"],
  ["Belize", "Belmopan", "North America"],
  ["Brazil", "Brasilia", "South America", "Real"],
  ["Argentina", "Buenos Aires", "South America", "Peso"],
  ["Chile", "Santiago", "South America", "Peso"],
  ["Peru", "Lima", "South America", "Sol"],
  ["Colombia", "Bogota", "South America", "Peso"],
  ["Venezuela", "Caracas", "South America", "Bolivar"],
  ["Ecuador", "Quito", "South America"],
  ["Bolivia", "Sucre", "South America", "Boliviano"],
  ["Paraguay", "Asuncion", "South America", "Guarani"],
  ["Uruguay", "Montevideo", "South America", "Peso"],
  ["Guyana", "Georgetown", "South America"],
  ["Suriname", "Paramaribo", "South America"],
  ["Australia", "Canberra", "Oceania", "Australian dollar"],
  ["New Zealand", "Wellington", "Oceania", "New Zealand dollar"],
  ["Fiji", "Suva", "Oceania"],
  ["Papua New Guinea", "Port Moresby", "Oceania", "Kina"],
  ["Samoa", "Apia", "Oceania", "Tala"],
  ["Tonga", "Nuku'alofa", "Oceania"],
];
const ALL_CAPITALS = COUNTRIES.map((c) => c[1]);
const ALL_COUNTRIES = COUNTRIES.map((c) => c[0]);
const CONTINENTS = ["Asia", "Europe", "Africa", "North America", "South America", "Oceania"];
const ALL_CURRENCIES = [...new Set(COUNTRIES.map((c) => c[3]).filter(Boolean))];

for (const [country, capital, continent, currency] of COUNTRIES) {
  add(`What is the capital of ${country}?`, capital, sample(ALL_CAPITALS, 3, new Set([capital])));
  if (capital !== country) {
    add(`${capital} is the capital of which country?`, country, sample(ALL_COUNTRIES, 3, new Set([country])));
  }
  add(`Which continent is ${country} in?`, continent, sample(CONTINENTS, 3, new Set([continent])));
  if (currency) {
    add(`What is the currency of ${country}?`, currency, sample(ALL_CURRENCIES, 3, new Set([currency])));
  }
}

// ---------------------------------------------------------------- US states
const STATES = [
  ["Alabama", "Montgomery"], ["Alaska", "Juneau"], ["Arizona", "Phoenix"],
  ["Arkansas", "Little Rock"], ["California", "Sacramento"], ["Colorado", "Denver"],
  ["Connecticut", "Hartford"], ["Delaware", "Dover"], ["Florida", "Tallahassee"],
  ["Georgia", "Atlanta"], ["Hawaii", "Honolulu"], ["Idaho", "Boise"],
  ["Illinois", "Springfield"], ["Indiana", "Indianapolis"], ["Iowa", "Des Moines"],
  ["Kansas", "Topeka"], ["Kentucky", "Frankfort"], ["Louisiana", "Baton Rouge"],
  ["Maine", "Augusta"], ["Maryland", "Annapolis"], ["Massachusetts", "Boston"],
  ["Michigan", "Lansing"], ["Minnesota", "St. Paul"], ["Mississippi", "Jackson"],
  ["Missouri", "Jefferson City"], ["Montana", "Helena"], ["Nebraska", "Lincoln"],
  ["Nevada", "Carson City"], ["New Hampshire", "Concord"], ["New Jersey", "Trenton"],
  ["New Mexico", "Santa Fe"], ["New York", "Albany"], ["North Carolina", "Raleigh"],
  ["North Dakota", "Bismarck"], ["Ohio", "Columbus"], ["Oklahoma", "Oklahoma City"],
  ["Oregon", "Salem"], ["Pennsylvania", "Harrisburg"], ["Rhode Island", "Providence"],
  ["South Carolina", "Columbia"], ["South Dakota", "Pierre"], ["Tennessee", "Nashville"],
  ["Texas", "Austin"], ["Utah", "Salt Lake City"], ["Vermont", "Montpelier"],
  ["Virginia", "Richmond"], ["Washington", "Olympia"], ["West Virginia", "Charleston"],
  ["Wisconsin", "Madison"], ["Wyoming", "Cheyenne"],
];
const STATE_CAPITALS = STATES.map((s) => s[1]);
const STATE_NAMES = STATES.map((s) => s[0]);
for (const [state, capital] of STATES) {
  add(`What is the capital of the US state of ${state}?`, capital, sample(STATE_CAPITALS, 3, new Set([capital])));
  add(`${capital} is the capital of which US state?`, state, sample(STATE_NAMES, 3, new Set([state])));
}

// ---------------------------------------------------------------- elements
const ELEMENTS = [
  ["Hydrogen", "H"], ["Helium", "He"], ["Lithium", "Li"], ["Carbon", "C"],
  ["Nitrogen", "N"], ["Oxygen", "O"], ["Fluorine", "F"], ["Neon", "Ne"],
  ["Sodium", "Na"], ["Magnesium", "Mg"], ["Aluminium", "Al"], ["Silicon", "Si"],
  ["Phosphorus", "P"], ["Sulfur", "S"], ["Chlorine", "Cl"], ["Argon", "Ar"],
  ["Potassium", "K"], ["Calcium", "Ca"], ["Titanium", "Ti"], ["Chromium", "Cr"],
  ["Manganese", "Mn"], ["Iron", "Fe"], ["Cobalt", "Co"], ["Nickel", "Ni"],
  ["Copper", "Cu"], ["Zinc", "Zn"], ["Arsenic", "As"], ["Bromine", "Br"],
  ["Silver", "Ag"], ["Tin", "Sn"], ["Iodine", "I"], ["Barium", "Ba"],
  ["Tungsten", "W"], ["Platinum", "Pt"], ["Gold", "Au"], ["Mercury", "Hg"],
  ["Lead", "Pb"], ["Radium", "Ra"], ["Uranium", "U"], ["Plutonium", "Pu"],
];
const ALL_SYMBOLS = ELEMENTS.map((e) => e[1]);
const ALL_ELEMENT_NAMES = ELEMENTS.map((e) => e[0]);
for (const [name, symbol] of ELEMENTS) {
  add(`What is the chemical symbol for ${name}?`, symbol, sample(ALL_SYMBOLS, 3, new Set([symbol])));
  add(`Which element has the chemical symbol ${symbol}?`, name, sample(ALL_ELEMENT_NAMES, 3, new Set([name])));
}

// ---------------------------------------------------------------- arithmetic
function numberDistractors(n) {
  const offsets = [n + 1, n - 1, n + 2, n - 2, n + 10, n - 10, n + 5, n - 5, n + 3, n - 3];
  return sample(offsets.filter((x) => x !== n && x >= 0), 3, new Set([n]));
}
for (let a = 12; a <= 19; a++) {
  for (let b = 3; b <= 9; b++) {
    add(`What is ${a} × ${b}?`, a * b, numberDistractors(a * b));
  }
}
for (let n = 11; n <= 32; n++) {
  add(`What is ${n} squared?`, n * n, [n * n + n, n * n - n, (n + 1) * (n + 1)]);
}
const PCT = [10, 20, 25, 50, 75];
const BASES = [40, 60, 80, 120, 160, 200, 240, 320, 480, 640];
for (const p of PCT) {
  for (const base of BASES) {
    const v = (p * base) / 100;
    if (Number.isInteger(v)) add(`What is ${p}% of ${base}?`, v, numberDistractors(v));
  }
}
for (let i = 0; i < 45; i++) {
  const a = 23 + Math.floor(rand() * 60);
  const b = 17 + Math.floor(rand() * 60);
  add(`What is ${a} + ${b}?`, a + b, numberDistractors(a + b));
  add(`What is ${a + b} − ${b}?`, a, numberDistractors(a));
}

// ---------------------------------------------------------------- roman numerals
function toRoman(num) {
  const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (num >= v) { out += s; num -= v; }
  return out;
}
for (let i = 0; i < 45; i++) {
  const n = 4 + Math.floor(rand() * 95);
  add(`What number is the Roman numeral ${toRoman(n)}?`, n, numberDistractors(n));
}

// ---------------------------------------------------------------- animals
const BABIES = [
  ["cat", "kitten"], ["dog", "puppy"], ["cow", "calf"], ["horse", "foal"],
  ["sheep", "lamb"], ["goat", "kid"], ["pig", "piglet"], ["chicken", "chick"],
  ["duck", "duckling"], ["goose", "gosling"], ["swan", "cygnet"], ["deer", "fawn"],
  ["bear", "cub"], ["lion", "cub"], ["kangaroo", "joey"], ["rabbit", "kit"],
  ["frog", "tadpole"], ["butterfly", "caterpillar"], ["eagle", "eaglet"], ["owl", "owlet"],
];
const BABY_NAMES = [...new Set(BABIES.map((b) => b[1]))];
for (const [animal, baby] of BABIES) {
  add(`What is a baby ${animal} called?`, baby, sample(BABY_NAMES, 3, new Set([baby])));
}
const GROUPS = [
  ["lions", "pride"], ["wolves", "pack"], ["crows", "murder"], ["fish", "school"],
  ["bees", "swarm"], ["geese", "gaggle"], ["owls", "parliament"], ["elephants", "herd"],
  ["dolphins", "pod"], ["monkeys", "troop"], ["ants", "colony"], ["ravens", "unkindness"],
  ["flamingos", "flamboyance"], ["jellyfish", "smack"], ["hyenas", "cackle"], ["porcupines", "prickle"],
];
const GROUP_NAMES = [...new Set(GROUPS.map((g) => g[1]))];
for (const [animals, group] of GROUPS) {
  add(`What is a group of ${animals} called?`, `A ${group}`, sample(GROUP_NAMES.map((g) => `A ${g}`), 3, new Set([`A ${group}`])));
}

// ---------------------------------------------------------------- curated sets
const CURATED = [
  // Space
  ["Which planet is closest to the Sun?", "Mercury", ["Venus", "Mars", "Earth"]],
  ["Which is the largest planet in the Solar System?", "Jupiter", ["Saturn", "Neptune", "Earth"]],
  ["Which planet is known as the Red Planet?", "Mars", ["Venus", "Jupiter", "Mercury"]],
  ["Which planet has the most prominent rings?", "Saturn", ["Jupiter", "Uranus", "Neptune"]],
  ["How many planets are in the Solar System?", "8", ["7", "9", "10"]],
  ["What is the closest star to Earth?", "The Sun", ["Proxima Centauri", "Sirius", "Polaris"]],
  ["What galaxy is Earth located in?", "The Milky Way", ["Andromeda", "Triangulum", "Whirlpool"]],
  ["Who was the first human to walk on the Moon?", "Neil Armstrong", ["Buzz Aldrin", "Yuri Gagarin", "Michael Collins"]],
  ["Who was the first human in space?", "Yuri Gagarin", ["Neil Armstrong", "John Glenn", "Alan Shepard"]],
  ["Which planet spins on its side?", "Uranus", ["Neptune", "Saturn", "Mars"]],
  ["What force keeps planets in orbit around the Sun?", "Gravity", ["Magnetism", "Friction", "Inertia"]],
  ["What is a light-year a measure of?", "Distance", ["Time", "Speed", "Brightness"]],
  ["Which planet is the hottest in the Solar System?", "Venus", ["Mercury", "Mars", "Jupiter"]],
  ["What is the name of Earth's natural satellite?", "The Moon", ["Titan", "Europa", "Phobos"]],
  ["Roughly how long does Earth take to orbit the Sun?", "365 days", ["180 days", "500 days", "30 days"]],
  // Human body
  ["How many bones does an adult human have?", "206", ["186", "226", "300"]],
  ["What is the largest organ of the human body?", "The skin", ["The liver", "The brain", "The lungs"]],
  ["Which organ pumps blood around the body?", "The heart", ["The liver", "The lungs", "The kidneys"]],
  ["How many chambers does the human heart have?", "4", ["2", "3", "6"]],
  ["Which part of the body controls balance?", "The inner ear", ["The nose", "The elbow", "The spleen"]],
  ["What do red blood cells carry around the body?", "Oxygen", ["Sugar", "Salt", "Vitamins"]],
  ["Which organ filters blood to produce urine?", "The kidneys", ["The liver", "The stomach", "The pancreas"]],
  ["What is the hardest substance in the human body?", "Tooth enamel", ["Bone", "Cartilage", "Fingernail"]],
  ["How many teeth does a typical adult human have?", "32", ["28", "36", "24"]],
  ["Which blood type is known as the universal donor?", "O negative", ["AB positive", "A positive", "B negative"]],
  ["What is the smallest bone in the human body?", "The stapes", ["The femur", "The radius", "The patella"]],
  ["Which gas do humans exhale more of than they inhale?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Hydrogen"]],
  ["What is the human body's normal temperature in Celsius?", "37", ["35", "39", "40"]],
  ["Which sense is most closely linked to memory?", "Smell", ["Sight", "Touch", "Taste"]],
  ["What is the colored part of the human eye called?", "The iris", ["The pupil", "The cornea", "The retina"]],
  // Science
  ["What is H2O commonly known as?", "Water", ["Salt", "Hydrogen peroxide", "Ammonia"]],
  ["At what temperature does water boil at sea level (Celsius)?", "100", ["90", "110", "120"]],
  ["At what temperature does water freeze (Celsius)?", "0", ["-10", "5", "10"]],
  ["What gas do plants absorb from the air?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Helium"]],
  ["What process do plants use to make food from sunlight?", "Photosynthesis", ["Respiration", "Fermentation", "Digestion"]],
  ["What is the speed of light, roughly?", "300,000 km per second", ["30,000 km per second", "3,000 km per second", "3 million km per second"]],
  ["Who developed the theory of general relativity?", "Albert Einstein", ["Isaac Newton", "Galileo Galilei", "Nikola Tesla"]],
  ["Who is credited with the laws of motion and gravity?", "Isaac Newton", ["Albert Einstein", "Charles Darwin", "Michael Faraday"]],
  ["What is the center of an atom called?", "The nucleus", ["The electron", "The shell", "The proton cloud"]],
  ["Which particle carries a negative charge?", "Electron", ["Proton", "Neutron", "Photon"]],
  ["What is the most abundant gas in Earth's atmosphere?", "Nitrogen", ["Oxygen", "Carbon dioxide", "Argon"]],
  ["Diamond is a form of which element?", "Carbon", ["Silicon", "Calcium", "Quartz"]],
  ["What does DNA stand for?", "Deoxyribonucleic acid", ["Dinucleic acid", "Deoxyribose nitrate", "Dual nucleic acid"]],
  ["Who proposed the theory of evolution by natural selection?", "Charles Darwin", ["Gregor Mendel", "Louis Pasteur", "Alfred Wegener"]],
  ["What instrument measures atmospheric pressure?", "Barometer", ["Thermometer", "Hygrometer", "Anemometer"]],
  ["What is the unit of electrical resistance?", "Ohm", ["Volt", "Ampere", "Watt"]],
  ["Sound travels fastest through which medium?", "Solids", ["Air", "Water", "A vacuum"]],
  ["What type of energy does a stretched rubber band store?", "Potential energy", ["Kinetic energy", "Thermal energy", "Sound energy"]],
  // Geography superlatives
  ["What is the largest ocean on Earth?", "Pacific Ocean", ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"]],
  ["What is the longest river in the world?", "The Nile", ["The Amazon", "The Yangtze", "The Mississippi"]],
  ["What is the largest desert in the world?", "The Sahara", ["The Gobi", "The Kalahari", "The Atacama"]],
  ["What is the highest mountain above sea level?", "Mount Everest", ["K2", "Kilimanjaro", "Denali"]],
  ["What is the largest country by land area?", "Russia", ["Canada", "China", "United States"]],
  ["What is the smallest country in the world?", "Vatican City", ["Monaco", "San Marino", "Liechtenstein"]],
  ["Which country has the largest population?", "India", ["China", "United States", "Indonesia"]],
  ["What is the deepest point in the world's oceans?", "Mariana Trench", ["Tonga Trench", "Java Trench", "Puerto Rico Trench"]],
  ["What is the largest island in the world?", "Greenland", ["Australia", "Borneo", "Madagascar"]],
  ["Which two countries share the longest land border?", "United States and Canada", ["Russia and China", "Chile and Argentina", "India and China"]],
  ["What is the largest rainforest in the world?", "The Amazon", ["The Congo", "The Daintree", "The Taiga"]],
  ["Which continent has the most countries?", "Africa", ["Asia", "Europe", "South America"]],
  ["What is the saltiest sea commonly swum in?", "The Dead Sea", ["The Red Sea", "The Black Sea", "The Baltic Sea"]],
  ["Which river flows through Egypt?", "The Nile", ["The Tigris", "The Euphrates", "The Congo"]],
  ["Mount Fuji is in which country?", "Japan", ["China", "South Korea", "Nepal"]],
  ["The Great Barrier Reef is off the coast of which country?", "Australia", ["Indonesia", "Philippines", "Fiji"]],
  ["Which strait separates Asia from North America?", "Bering Strait", ["Strait of Gibraltar", "Strait of Malacca", "Bosporus"]],
  ["Which country is both in Europe and Asia?", "Turkey", ["Greece", "Egypt", "Portugal"]],
  ["What imaginary line divides Earth into Northern and Southern Hemispheres?", "The Equator", ["The Prime Meridian", "The Tropic of Cancer", "The International Date Line"]],
  ["Which ocean lies between Africa and Australia?", "Indian Ocean", ["Pacific Ocean", "Atlantic Ocean", "Southern Ocean"]],
  // Landmarks
  ["The Eiffel Tower is in which city?", "Paris", ["London", "Rome", "Brussels"]],
  ["The Statue of Liberty stands in which city?", "New York City", ["Washington, D.C.", "Boston", "Philadelphia"]],
  ["The Colosseum is in which city?", "Rome", ["Athens", "Naples", "Istanbul"]],
  ["The Taj Mahal is in which country?", "India", ["Pakistan", "Bangladesh", "Iran"]],
  ["The Great Wall is in which country?", "China", ["Japan", "Mongolia", "Korea"]],
  ["Machu Picchu is in which country?", "Peru", ["Mexico", "Bolivia", "Chile"]],
  ["The pyramids of Giza are in which country?", "Egypt", ["Sudan", "Libya", "Jordan"]],
  ["Big Ben is a landmark in which city?", "London", ["Manchester", "Dublin", "Edinburgh"]],
  ["The Sydney Opera House is in which country?", "Australia", ["New Zealand", "United Kingdom", "Canada"]],
  ["Christ the Redeemer overlooks which city?", "Rio de Janeiro", ["Sao Paulo", "Buenos Aires", "Lima"]],
  ["The Leaning Tower is in which Italian city?", "Pisa", ["Venice", "Florence", "Milan"]],
  ["Petra, the rock-cut city, is in which country?", "Jordan", ["Egypt", "Israel", "Saudi Arabia"]],
  ["Angkor Wat is in which country?", "Cambodia", ["Thailand", "Vietnam", "Laos"]],
  ["The Acropolis is in which city?", "Athens", ["Rome", "Alexandria", "Sparta"]],
  ["Stonehenge is in which country?", "England", ["Scotland", "Ireland", "Wales"]],
  ["The Burj Khalifa, the world's tallest building, is in which city?", "Dubai", ["Abu Dhabi", "Doha", "Riyadh"]],
  ["Chichen Itza was built by which civilization?", "The Maya", ["The Aztec", "The Inca", "The Olmec"]],
  ["The Golden Gate Bridge is in which city?", "San Francisco", ["Los Angeles", "Seattle", "New York City"]],
  ["The Louvre museum is in which city?", "Paris", ["London", "Madrid", "Vienna"]],
  ["Mount Rushmore is in which US state?", "South Dakota", ["North Dakota", "Wyoming", "Montana"]],
  // History
  ["In which year did World War II end?", "1945", ["1944", "1946", "1943"]],
  ["In which year did World War I begin?", "1914", ["1912", "1916", "1918"]],
  ["Who was the first President of the United States?", "George Washington", ["Thomas Jefferson", "Abraham Lincoln", "John Adams"]],
  ["Which empire built the Colosseum?", "The Roman Empire", ["The Greek Empire", "The Ottoman Empire", "The Byzantine Empire"]],
  ["Who was the ancient Egyptian queen famed for her alliance with Rome?", "Cleopatra", ["Nefertiti", "Hatshepsut", "Isis"]],
  ["The Titanic sank in which year?", "1912", ["1905", "1918", "1923"]],
  ["Who painted the Mona Lisa?", "Leonardo da Vinci", ["Michelangelo", "Raphael", "Vincent van Gogh"]],
  ["Which explorer completed the first circumnavigation expedition of the globe?", "Ferdinand Magellan's expedition", ["Christopher Columbus's expedition", "Vasco da Gama's expedition", "James Cook's expedition"]],
  ["The Berlin Wall fell in which year?", "1989", ["1985", "1991", "1979"]],
  ["Who was the leader of the Soviet Union during World War II?", "Joseph Stalin", ["Vladimir Lenin", "Nikita Khrushchev", "Leon Trotsky"]],
  ["Which ship carried the Pilgrims to America in 1620?", "The Mayflower", ["The Santa Maria", "The Beagle", "The Endeavour"]],
  ["Who was the British Prime Minister for most of World War II?", "Winston Churchill", ["Neville Chamberlain", "Clement Attlee", "Harold Wilson"]],
  ["The French Revolution began in which year?", "1789", ["1776", "1799", "1804"]],
  ["Who was the first Emperor of Rome?", "Augustus", ["Julius Caesar", "Nero", "Constantine"]],
  ["The Renaissance began in which country?", "Italy", ["France", "England", "Spain"]],
  ["Which civilization built Machu Picchu?", "The Inca", ["The Maya", "The Aztec", "The Toltec"]],
  ["Who invented the printing press with movable type in Europe?", "Johannes Gutenberg", ["Martin Luther", "Leonardo da Vinci", "Benjamin Franklin"]],
  ["In which year did humans first land on the Moon?", "1969", ["1965", "1972", "1959"]],
  ["Who was assassinated in Sarajevo in 1914, sparking World War I?", "Archduke Franz Ferdinand", ["Kaiser Wilhelm II", "Tsar Nicholas II", "Otto von Bismarck"]],
  ["Which ancient wonder stood in Alexandria?", "The Lighthouse (Pharos)", ["The Hanging Gardens", "The Colossus", "The Great Ziggurat"]],
  // Sports
  ["How many players are on a soccer team on the field?", "11", ["9", "10", "12"]],
  ["How many players are on a basketball team on the court?", "5", ["6", "7", "4"]],
  ["How many points is a touchdown worth in American football?", "6", ["3", "7", "5"]],
  ["In which sport would you perform a slam dunk?", "Basketball", ["Volleyball", "Tennis", "Badminton"]],
  ["How often are the Summer Olympic Games held?", "Every 4 years", ["Every 2 years", "Every 5 years", "Every 3 years"]],
  ["Which country hosts the Wimbledon tennis tournament?", "United Kingdom", ["United States", "France", "Australia"]],
  ["In boxing, what does a KO stand for?", "Knockout", ["Kickout", "Knock over", "Keep on"]],
  ["How many rings are on the Olympic flag?", "5", ["4", "6", "7"]],
  ["Which sport uses a shuttlecock?", "Badminton", ["Tennis", "Squash", "Table tennis"]],
  ["What is the maximum score in ten-pin bowling?", "300", ["200", "250", "360"]],
  ["In golf, what is one stroke under par called?", "Birdie", ["Eagle", "Bogey", "Albatross"]],
  ["Which country invented basketball's biggest league, the NBA?", "United States", ["Canada", "Spain", "Argentina"]],
  ["A marathon is approximately how many kilometers?", "42", ["36", "50", "45"]],
  ["Which sport is Manny Pacquiao famous for?", "Boxing", ["Basketball", "Billiards", "Taekwondo"]],
  ["In chess, which piece can only move diagonally?", "Bishop", ["Rook", "Knight", "Queen"]],
  ["How many holes are played in a standard round of golf?", "18", ["9", "16", "20"]],
  ["Which sport awards the FIFA World Cup?", "Soccer (football)", ["Rugby", "Cricket", "Volleyball"]],
  ["What color belt is the highest common rank in karate?", "Black", ["Red", "Brown", "White"]],
  ["In volleyball, how many touches may one team make before returning the ball?", "3", ["2", "4", "5"]],
  ["Which two pieces are involved in castling in chess?", "King and rook", ["King and queen", "Rook and bishop", "Queen and knight"]],
  // Literature & arts
  ["Who wrote 'Romeo and Juliet'?", "William Shakespeare", ["Charles Dickens", "Jane Austen", "Mark Twain"]],
  ["Who wrote 'Harry Potter'?", "J.K. Rowling", ["J.R.R. Tolkien", "Roald Dahl", "C.S. Lewis"]],
  ["Who wrote 'The Lord of the Rings'?", "J.R.R. Tolkien", ["J.K. Rowling", "George R.R. Martin", "C.S. Lewis"]],
  ["Who painted the ceiling of the Sistine Chapel?", "Michelangelo", ["Leonardo da Vinci", "Raphael", "Donatello"]],
  ["Who painted 'Starry Night'?", "Vincent van Gogh", ["Claude Monet", "Pablo Picasso", "Salvador Dali"]],
  ["Who wrote 'Noli Me Tangere'?", "Jose Rizal", ["Andres Bonifacio", "Emilio Aguinaldo", "Marcelo del Pilar"]],
  ["What is the first book of the Old Testament?", "Genesis", ["Exodus", "Psalms", "Leviticus"]],
  ["Who wrote 'The Odyssey'?", "Homer", ["Virgil", "Sophocles", "Plato"]],
  ["Sherlock Holmes was created by which author?", "Arthur Conan Doyle", ["Agatha Christie", "Edgar Allan Poe", "Ian Fleming"]],
  ["Which fairy tale features a glass slipper?", "Cinderella", ["Snow White", "Sleeping Beauty", "Rapunzel"]],
  ["Who wrote 'Pride and Prejudice'?", "Jane Austen", ["Charlotte Bronte", "Emily Dickinson", "Mary Shelley"]],
  ["In 'Moby-Dick', what is Moby Dick?", "A white whale", ["A pirate ship", "A sea captain", "A giant squid"]],
  ["Who created Mickey Mouse?", "Walt Disney", ["Chuck Jones", "Stan Lee", "Hanna-Barbera"]],
  ["What nationality was composer Ludwig van Beethoven?", "German", ["Austrian", "French", "Italian"]],
  ["How many strings does a standard guitar have?", "6", ["4", "5", "7"]],
  ["Which instrument has 88 keys?", "Piano", ["Organ", "Accordion", "Harpsichord"]],
  ["Who is the Greek god of the sea?", "Poseidon", ["Zeus", "Hades", "Apollo"]],
  ["Who is the Greek god of thunder and the sky?", "Zeus", ["Ares", "Hermes", "Poseidon"]],
  ["In Greek mythology, who flew too close to the sun?", "Icarus", ["Daedalus", "Perseus", "Achilles"]],
  ["What creature is half man, half horse in Greek myth?", "Centaur", ["Minotaur", "Satyr", "Cyclops"]],
  // Philippines
  ["Who is the national hero of the Philippines?", "Jose Rizal", ["Andres Bonifacio", "Lapu-Lapu", "Emilio Aguinaldo"]],
  ["What is the national bird of the Philippines?", "Philippine eagle", ["Maya", "Sarimanok", "Kingfisher"]],
  ["How many main island groups does the Philippines have?", "3", ["2", "4", "5"]],
  ["What are the three main island groups of the Philippines?", "Luzon, Visayas, Mindanao", ["Luzon, Palawan, Mindanao", "Visayas, Cebu, Davao", "Luzon, Visayas, Palawan"]],
  ["Which Philippine volcano is famous for its near-perfect cone?", "Mayon", ["Taal", "Pinatubo", "Kanlaon"]],
  ["In what year did the Philippines declare independence from Spain?", "1898", ["1896", "1901", "1946"]],
  ["Who led the Katipunan revolutionary movement?", "Andres Bonifacio", ["Jose Rizal", "Antonio Luna", "Gregorio del Pilar"]],
  ["Which Philippine hero defeated Magellan at the Battle of Mactan?", "Lapu-Lapu", ["Rajah Sulayman", "Datu Puti", "Rajah Humabon"]],
  ["What is the national flower of the Philippines?", "Sampaguita", ["Gumamela", "Ilang-ilang", "Waling-waling"]],
  ["What is the smallest hoofed mammal, found in Bohol?", "Philippine mouse-deer", ["Tarsier", "Tamaraw", "Civet"]],
  ["Which Philippine island is famous for the Chocolate Hills?", "Bohol", ["Cebu", "Palawan", "Siquijor"]],
  ["What is the largest lake in the Philippines?", "Laguna de Bay", ["Taal Lake", "Lake Lanao", "Lake Sebu"]],
  ["Which Philippine city is known as the Queen City of the South?", "Cebu City", ["Davao City", "Iloilo City", "Bacolod City"]],
  ["What is the staple food of the Philippines?", "Rice", ["Corn", "Bread", "Cassava"]],
  ["Which festival in Cebu honors the Santo Niño?", "Sinulog", ["Ati-Atihan", "Dinagyang", "MassKara"]],
  ["What Philippine dish is meat stewed in vinegar and soy sauce?", "Adobo", ["Sinigang", "Kare-kare", "Tinola"]],
  ["What is the national sport of the Philippines?", "Arnis", ["Basketball", "Boxing", "Sipa"]],
  ["Which sea creature is the 'butanding' in the Philippines?", "Whale shark", ["Manta ray", "Dolphin", "Dugong"]],
  ["What is the longest river in the Philippines?", "Cagayan River", ["Pasig River", "Agusan River", "Pampanga River"]],
  ["Which underground river in Palawan is a UNESCO site?", "Puerto Princesa Underground River", ["Hinatuan River", "Loboc River", "Cagayan River"]],
  // Inventions & tech
  ["Who invented the telephone?", "Alexander Graham Bell", ["Thomas Edison", "Nikola Tesla", "Guglielmo Marconi"]],
  ["Who invented the light bulb (commercially practical)?", "Thomas Edison", ["Nikola Tesla", "Benjamin Franklin", "James Watt"]],
  ["Who are credited with inventing the airplane?", "The Wright brothers", ["The Montgolfier brothers", "Henry Ford", "Samuel Langley"]],
  ["Who discovered penicillin?", "Alexander Fleming", ["Louis Pasteur", "Marie Curie", "Joseph Lister"]],
  ["Marie Curie won Nobel Prizes in which two fields?", "Physics and Chemistry", ["Physics and Medicine", "Chemistry and Peace", "Medicine and Literature"]],
  ["Who founded Microsoft?", "Bill Gates and Paul Allen", ["Steve Jobs and Steve Wozniak", "Larry Page and Sergey Brin", "Mark Zuckerberg"]],
  ["Who co-founded Apple?", "Steve Jobs and Steve Wozniak", ["Bill Gates and Paul Allen", "Jeff Bezos", "Elon Musk"]],
  ["What does 'WWW' stand for?", "World Wide Web", ["World Web Window", "Wide World Web", "Web World Wide"]],
  ["What does 'CPU' stand for?", "Central Processing Unit", ["Computer Personal Unit", "Central Program Utility", "Core Processing Unit"]],
  ["Which company created the Android operating system?", "Google (Android Inc.)", ["Apple", "Microsoft", "Samsung"]],
  ["What does 'USB' stand for?", "Universal Serial Bus", ["United System Board", "Universal System Backup", "Unified Serial Band"]],
  ["Which scientist proposed the three laws of motion?", "Isaac Newton", ["Albert Einstein", "Galileo Galilei", "Johannes Kepler"]],
  ["The first successful vaccine protected against which disease?", "Smallpox", ["Polio", "Measles", "Rabies"]],
  ["Who invented dynamite and founded the Nobel Prizes?", "Alfred Nobel", ["Albert Einstein", "Henry Cavendish", "Robert Oppenheimer"]],
  ["What does 'AI' stand for in technology?", "Artificial Intelligence", ["Automated Interface", "Advanced Internet", "Applied Informatics"]],
  // Food & everyday
  ["Which fruit is known for keeping the doctor away?", "Apple", ["Banana", "Orange", "Grape"]],
  ["Sushi originated in which country?", "Japan", ["China", "Korea", "Thailand"]],
  ["Pizza originated in which country?", "Italy", ["France", "Greece", "United States"]],
  ["What is the main ingredient of guacamole?", "Avocado", ["Tomato", "Cucumber", "Pea"]],
  ["Which spice is the most expensive by weight?", "Saffron", ["Vanilla", "Cardamom", "Cinnamon"]],
  ["Honey is made by which insects?", "Bees", ["Wasps", "Ants", "Butterflies"]],
  ["Which vegetable makes people cry when chopped?", "Onion", ["Carrot", "Potato", "Cabbage"]],
  ["Chocolate is made from the beans of which tree?", "Cacao", ["Coffee", "Vanilla", "Palm"]],
  ["What is the most consumed beverage in the world after water?", "Tea", ["Coffee", "Beer", "Juice"]],
  ["Paella is a rice dish from which country?", "Spain", ["Italy", "Mexico", "Portugal"]],
  // Calendar & misc
  ["How many days are in a leap year?", "366", ["365", "364", "367"]],
  ["How many days does February have in a leap year?", "29", ["28", "30", "31"]],
  ["How many minutes are in a full day?", "1440", ["1240", "1540", "1640"]],
  ["How many seconds are in an hour?", "3600", ["3000", "6000", "1800"]],
  ["How many sides does a hexagon have?", "6", ["5", "7", "8"]],
  ["How many sides does an octagon have?", "8", ["6", "7", "9"]],
  ["How many degrees are in a right angle?", "90", ["45", "180", "60"]],
  ["How many degrees are in a full circle?", "360", ["180", "270", "400"]],
  ["How many continents are there on Earth?", "7", ["5", "6", "8"]],
  ["How many colors are in a rainbow?", "7", ["6", "8", "5"]],
  ["What is the first letter of the Greek alphabet?", "Alpha", ["Beta", "Omega", "Gamma"]],
  ["What is the last letter of the Greek alphabet?", "Omega", ["Zeta", "Alpha", "Sigma"]],
  ["How many keys are on a standard piano?", "88", ["76", "92", "100"]],
  ["How many cards are in a standard deck (no jokers)?", "52", ["50", "54", "48"]],
  ["How many zeros are in one million?", "6", ["5", "7", "9"]],
];
for (const [q, a, d] of CURATED) add(q, a, d);

// ---------------------------------------------------------------- output
const shuffled = questions
  .map((q) => [rand(), q])
  .sort((x, y) => x[0] - y[0])
  .map(([, q]) => q);

const TARGET = 1000;
if (shuffled.length < TARGET) {
  console.error(`Only generated ${shuffled.length} questions — need ${TARGET}`);
  process.exit(1);
}
const out = shuffled.slice(0, TARGET);
const banner =
  "// Generated by tools/gen-trivia.js — do not hand-edit.\n" +
  "// 1000 general-knowledge questions, 4 choices each ({ q, a, d }).\n\n";
fs.writeFileSync(
  path.join(__dirname, "..", "js", "trivia.js"),
  banner + `export const TRIVIA = ${JSON.stringify(out)};\n`
);
console.log(`Wrote ${out.length} questions (from a pool of ${shuffled.length})`);
