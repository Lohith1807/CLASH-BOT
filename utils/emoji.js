const emojis = {
  th11: "1410154638623117442",
  th12: "1410154614501806193",
  th13: "1410154589445165056",
  th14: "1410138015078289499",
  th15: "1410138042789924905",
  th16: "1410138061177618563",
  th17: "1410138087555858482",
  th18: "1440691735440392303",
  clancastle: "1410138154484240424",
  whitefwa: "1410138132598362283",
  fwalead: "1410138110313893939",
  throphy: "1410137987198746636",
  cwl: "1410137961948774440",
  crown: "1410137941396815882",
  coc: "1410137905938169926",
  ccw: "1410137878784245850",
  tickred: "1410137850229555290",
  heart: "1410137819598426156",
  alaram: "1410137801877491822",
  bluefwa: "1410137759179472969",
  bluex: "1410137736765243432",
  question: "1410137718457106452",
  gtick: "1410137697300775026",
  cocfight: "1410132596763131914",
  arrow: "1410132410061819924",
  mem: "1412062949832527922",
  wow: "1420946769298063461",
  drop: "1420946897450958908",
  rarrow: "1421868916782792846",
  larrow: "1421868930187788349",
  bluestar: "1425846252490194945",
  xp: "1427644973053902858",
  uparrow: "1427644609508409416",
  downarrow: "1427644615124586516",
  capitalgold: "1427644986400178247",
  graph: "1427644631688024084",
  clangames: "1427646350723649667",
  sheild: "1427653084380794940",
  refresh: "1506184937458630696",
  blood: "1504385401295474758",
  bb: "1526240399721631955",
  tl: "1526240427441786951",
  su: "1526240434534355044",
  ik: "1526240444957200424",
  dw: "1526240456416170076",
  cc: "1526240465240985731",
  bl: "1526240407225372896",
  asr: "1526240473121816776",
  bbs: "1506991458106736741",
  kc: "1526240481778860175",
  parrow: "1410131664629272626",
  loading: "1503023363172335826",
  book: "1504385352528297985",
  pinkdot: "1504385595995324496",
  orangedot: "1504385599723933756",
  cyandot: "1504385603683356682",
  bluedot: "1504385607626002485",
  rarroww: "1504385836102451290",
  yarrow: "1504386649654689852",
  chain: "1504386899723161710",
  tickbox: "1508465148434579517",
  wrongbox: "1508465151182110841",
  bwc: "1526240490343895113",
  qg: "1526240502460973096",
  delete: "1516659340898078751",
  letterd: "1516818700295077968",
  lettern: "1516818716380106802",
  lettero: "1516818740975763586",
  letterb: "1516818762148610158",
  letterc: "1516818788320805005",
  lettere: "1516818805366456320",
  lettera: "1516818823079002202",
  letteri: "1516818834063884359",
  letterl: "1516818843412987964",
  wel: "1516820130439499946",
  stars: "1516830273285783673",
  bird: "1516830276184051832",
  darrow: "1516837157120118925",
  reddot: "1518164961270960249",
  greendot: "1518164965884825771",
  cfw: "1526240511957143564",
  bz: "1526240418495467614",
  bkl: "1526240521457238148",
  WitchLeague: "1523005474251997394",
  WizardLeague: "1523005477414506627",
  ArcherLeague: "1523005546234380298",
  BarbarianLeague: "1523005549996671056",
  DragonLeague: "1523005554434380037",
  ElectroLeague: "1523005557806596170",
  TitanLeague: "1523005561870745780",
  GolemLeague: "1523005565566058659",
  LegendLeague: "1523005569743585481",
  PEKKALeague: "1523005573652680914",
  SkeletonLeague: "1523005577251520592",
  ValkyrieLeague: "1523005580849971371",
  bronze: "1524360232346587287",
  champion: "1524360236054483044",
  crystal: "1524360238961004654",
  gold: "1524360241217671370",
  legend: "1524360244288032768",
  master: "1524360247077113907",
  silver: "1524360249677451394",
  titan: "1524360252324188230",
  unranked: "1524360254702223472",
  lightbluedot: "1526220742826393741",
  hd: "1526240529493528646",
  eon: "1526240535742775396",
  sleep_coc: "1526556305727160460"
};
// Function to get animated emoji (with <a:>), else static emoji (<:>)
const animatedEmojis = new Set([
  "arrow",
  "crown",
  "heart",
  "alaram",
  "bluefwa",
  "bluex",
  "question",
  "bluestar",
  "whitefwa",
  "tickred",
  "wow",
  "uparrow",
  "downarrow",
  "graph",
  "cocfight",
  "parrow",
  "loading",
  "book",
  "pinkdot",
  "orangedot",
  "cyandot",
  "bluedot",
  "rarroww",
  "yarrow",
  "chain",
  "letterd",
  "lettern",
  "lettero",
  "letterb",
  "letterc",
  "lettere",
  "lettera",
  "letteri",
  "letterl",
  "wel",
  "stars",
  "bird",
  "darrow",
  "reddot",
  "greendot",
  "lightbluedot",
  "sleep_coc"
]);

const getEmoji = (name) => {
  if (!emojis[name]) return ""; // Return empty string if emoji not found
  const id = emojis[name];
  if (animatedEmojis.has(name)) {
    return `<a:${name}:${id}>`;
  }
  return `<:${name}:${id}>`;
};
const getEmojiObject = (name) => {
  if (!emojis[name]) return null;
  return {
    id: emojis[name],
    name: name,
    animated: animatedEmojis.has(name)
  };
};

const getLeagueEmoji = (leagueName, fallback = "throphy") => {
    if (!leagueName || leagueName === "Unranked") return getEmoji("unranked") || getEmoji(fallback) || "🏆";
    const upperLeagueName = leagueName.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const knownLeagues = ["ELECTRO", "SKELETON", "BARBARIAN", "VALKYRIE", "WIZARD", "ARCHER", "DRAGON", "LEGEND", "TITAN", "GOLEM", "WITCH", "PEKKA"];
    
    let matchedBase = null;
    for (const kl of knownLeagues) {
        if (upperLeagueName.includes(kl)) {
            matchedBase = kl;
            break;
        }
    }
    
    let leagueEmojiKey = "";
    if (matchedBase) {
        leagueEmojiKey = matchedBase === "PEKKA" ? "PEKKALeague" : matchedBase.charAt(0).toUpperCase() + matchedBase.slice(1).toLowerCase() + "League";
    } else {
        let base = leagueName.split(" ")[0].replace(/\./g, '');
        let formattedBase = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
        leagueEmojiKey = formattedBase + "League";
    }
    
    return getEmoji(leagueEmojiKey) || getEmoji(fallback) || "🏆";
};

const getCwlLeagueEmoji = (leagueName, fallback = "cwl") => {
    if (!leagueName) return getEmoji("unranked") || getEmoji(fallback) || "🏆";
    if (leagueName === "Unranked") return getEmoji("unranked") || getEmoji(fallback) || "🏆";
    let base = leagueName.split(" ")[0].replace(/\./g, '').toLowerCase();
    return getEmoji(base) || getEmoji(fallback) || "🏆";
};

module.exports = {
  emojis,
  getEmoji,
  getEmojiObject,
  getLeagueEmoji,
  getCwlLeagueEmoji
};
