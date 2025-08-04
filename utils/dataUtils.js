/**
 * Gera um timestamp UNIX (em segundos) a partir de uma string de duração.
 * Formatos aceitos: "15m" (minutos), "1h" (horas), "7d" (dias).
 * @param {string} durationString - A string que representa a duração (ex: "1h").
 * @returns {number} O timestamp UNIX em segundos para a expiração.
 */
function generateExpirationTime(durationString) {
  // ⚙️ 1. Analisa a string para extrair o valor e a unidade usando Regex
  const regex = /^(\d+)([mhd])$/; // Ex: 15m, 1h, 7d
  const match = durationString.match(regex);

  if (!match) {
    throw new Error('Formato de duração inválido. Use "15m", "1h", "7d", etc.');
  }

  // O match retorna um array: [stringCompleta, grupo1, grupo2]
  // Ex: ["15m", "15", "m"]
  const value = parseInt(match[1], 10);
  const unit = match[2];

  // 🧮 2. Mapeia a unidade para seu valor em segundos
  const multipliers = {
    m: 60,          // 1 minuto = 60 segundos
    h: 60 * 60,       // 1 hora = 3600 segundos
    d: 24 * 60 * 60,  // 1 dia = 86400 segundos
  };

  if (!multipliers[unit]) {
     // Este erro é tecnicamente coberto pelo regex, mas é uma boa prática de defesa
    throw new Error(`Unidade de tempo desconhecida: "${unit}"`);
  }

  const secondsToAdd = value * multipliers[unit];

  // 🕒 3. Calcula o timestamp final
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expirationTimestamp = nowInSeconds + secondsToAdd;

  return expirationTimestamp;
};

module.exports = { generateExpirationTime };