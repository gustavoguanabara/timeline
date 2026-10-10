/**
 * js/data-loader.js
 * Módulo de carregamento e indexação dos dados estáticos (historia.json e top10.json)
 */

let cachedHistoria = null;
let cachedTop10 = null;

/**
 * Carrega a base completa de marcos históricos
 * @returns {Promise<Array>} Lista com os 174 marcos
 */
export async function loadHistoria() {
  if (cachedHistoria) return cachedHistoria;
  
  const response = await fetch('data/historia.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Falha ao carregar historia.json: HTTP ${response.status}`);
  }
  const raw = await response.json();
  cachedHistoria = raw.map(item => ({
    ...item,
    ano: parseInt(item.ano, 10),
    imagem_local: `data/images/${item.ref}.jpg`,
    pais: item['país'] || item.pais || 'Mundo',
    titulo: item.resumo
  }));
  return cachedHistoria;
}

/**
 * Carrega a semente padrão do ranking Top 10
 * @returns {Promise<Array>} Lista com os 10 recordes sementes
 */
export async function loadTop10Seed() {
  if (cachedTop10) return cachedTop10;

  const response = await fetch('data/top10.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Falha ao carregar top10.json: HTTP ${response.status}`);
  }
  cachedTop10 = await response.json();
  return cachedTop10;
}

/**
 * Retorna as categorias que atendem ao critério mínimo de 11 anos distintos
 * @param {Array} marcos Lista de marcos
 * @returns {Array<string>} Categorias elegíveis
 */
export function getEligibleCategories(marcos) {
  const catMap = new Map();
  for (const m of marcos) {
    if (!catMap.has(m.categoria)) catMap.set(m.categoria, new Set());
    catMap.get(m.categoria).add(m.ano);
  }

  const eligible = [];
  for (const [cat, anos] of catMap.entries()) {
    if (anos.size >= 11) {
      eligible.push(cat);
    }
  }
  return eligible;
}

const imageCache = new Map();

/**
 * Pré-carrega uma imagem para o cache do navegador e memória
 * @param {string} src Caminho da imagem
 * @returns {Promise<HTMLImageElement>}
 */
export function preloadImage(src) {
  if (imageCache.has(src)) {
    return Promise.resolve(imageCache.get(src));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = (err) => reject(new Error(`Erro ao carregar imagem: ${src}`));
    img.src = src;
  });
}

/**
 * Retorna uma imagem se já estiver em cache ou inicia o carregamento em background
 * @param {string} src
 * @returns {HTMLImageElement|null}
 */
export function getImage(src) {
  if (!src) return null;
  if (imageCache.has(src)) {
    return imageCache.get(src);
  }
  const img = new Image();
  img.onload = () => {
    imageCache.set(src, img);
  };
  img.src = src;
  return null;
}

/**
 * Pré-carrega um lote de imagens em paralelo
 * @param {Array<string>} urls
 * @returns {Promise<Array<HTMLImageElement>>}
 */
export async function preloadBatch(urls) {
  const promises = urls.map(url => preloadImage(url).catch(err => {
    console.warn(`Aviso de imagem não carregada: ${url}`, err);
    return null;
  }));
  return Promise.all(promises);
}

