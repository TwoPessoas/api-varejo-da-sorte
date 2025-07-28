const { stringify } = require("csv-stringify");

/**
 * Gera um buffer CSV a partir de um array de dados.
 * @param {Array<Object>} data - Array de objetos a serem exportados.
 * @param {Array<Object>} columns - Array de definições de coluna ({ key, header }).
 * @returns {Promise<Buffer>} Uma promessa que resolve com o buffer CSV.
 */
const generateCsv = (data, columns) => {
  return new Promise((resolve, reject) => {
    stringify(
      data,
      {
        header: true,
        columns: columns.map((col) => ({ key: col.key, header: col.header })),
        cast: {
          date: (value) => (value ? new Date(value).toISOString() : ""), // Converte datas para string ISO
          boolean: (value) => (value ? "Sim" : "Não"), // Converte booleanos para 'Sim'/'Não'
        },
      },
      (err, output) => {
        if (err) return reject(err);
        resolve(Buffer.from(output));
      }
    );
  });
};

module.exports = { generateCsv };
