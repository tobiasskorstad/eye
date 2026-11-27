// All konfigurasjon via miljøvariabler, med fornuftige standardverdier.
const env = process.env;

export const config = {
  port: Number(env.PORT || 8080),
  dataDir: env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
  publicDir: new URL('../public/', import.meta.url).pathname,
  contentDir: env.CONTENT_DIR || new URL('../content/', import.meta.url).pathname,

  stortingetApi: env.STORTINGET_API || 'https://data.stortinget.no/eksport',
  stortingetWeb: env.STORTINGET_WEB || 'https://www.stortinget.no',
  registerPage: env.REGISTER_PAGE ||
    'https://www.stortinget.no/no/stortinget-og-demokratiet/representantene/okonomiske-interesser/',
  trustProxy: env.TRUST_PROXY === '1',
  globalPerMinute: Number(env.GLOBAL_PER_MINUTE || 600),
  faktiskUrl: env.FAKTISK_URL || 'https://www.faktisk.no/tag/faktasjekk',
  wikiNo: env.WIKI_NO || 'https://no.wikipedia.org/w/api.php',
  wikiEn: env.WIKI_EN || 'https://en.wikipedia.org/w/api.php',
  wikidataDelayMs: Number(env.WIKIDATA_DELAY_MS ?? 1000),
  wikiSv: env.WIKI_SV || 'https://sv.wikipedia.org/w/api.php',
  wikiDa: env.WIKI_DA || 'https://da.wikipedia.org/w/api.php',
  wikidataApi: env.WIKIDATA_API || 'https://www.wikidata.org/w/api.php',
  commonsFile: env.COMMONS_FILE || 'https://commons.wikimedia.org/wiki/Special:FilePath/',
  wikiUpload: env.WIKI_UPLOAD || 'https://upload.wikimedia.org/',
  osloBorsApi: env.OSLOBORS_API || 'https://api3.oslo.oslobors.no/v1/newsreader',
  pollUrl: env.POLL_URL || 'https://www.pollofpolls.no/?cmd=Stortinget',
  wikidataUrl: env.WIKIDATA_URL || 'https://query.wikidata.org/sparql',
  brregApi: env.BRREG_API || 'https://data.brreg.no/enhetsregisteret/api',

  // Klokkeslett (Europe/Oslo) for nattlig oppdatering. Sett REFRESH_HOUR=-1 for å slå av.
  refreshHour: Number(env.REFRESH_HOUR ?? 3),
  // Bygg data ved oppstart hvis det ikke finnes data fra før.
  buildOnStart: env.BUILD_ON_START !== '0',

  // Høflighet mot kildene
  concurrency: Number(env.CONCURRENCY || 4),
  delayMs: Number(env.DELAY_MS || 120),
  // Stortingets API har kvote; voteringer hentes sakte
  stortingetDelayMs: Number(env.STORTINGET_DELAY_MS ?? 700),
  maxNewVotes: Number(env.MAX_NEW_VOTES || 150),
  userAgent: env.USER_AGENT || 'EYE/0.2 (https://tobiasskorstad.github.io/eye/; https://github.com/tobiasskorstad/eye/issues) node-fetch',
};
