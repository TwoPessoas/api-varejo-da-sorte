const ExcelJS = require("exceljs");

/**
 * Gera um buffer XLSX a partir de um array de dados.
 * @param {Array<Object>} data - Array de objetos a serem exportados.
 * @param {Array<Object>} columns - Array de definições de coluna ({ key, header, width }).
 * @returns {Promise<Buffer>} Uma promessa que resolve com o buffer XLSX.
 */
const generateXlsx = async (data, columns) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Export Data");

  worksheet.columns = columns;

  // Mapeia os dados para formatar datas e booleanos para o Excel
  const mappedData = data.map((row) => {
    const newRow = { ...row };
    columns.forEach((col) => {
      // Heurística para campos de data (terminam com _at ou são 'birthday' ou contêm 'Date')
      if (
        col.key.includes("_at") ||
        col.key === "birthday" ||
        col.key.includes("Date")
      ) {
        if (newRow[col.key]) {
          newRow[col.key] = new Date(newRow[col.key]).toLocaleString("pt-BR");
        } else {
          newRow[col.key] = "";
        }
      } else if (typeof newRow[col.key] === "boolean") {
        newRow[col.key] = newRow[col.key] ? "Sim" : "Não";
      }
    });
    return newRow;
  });

  worksheet.addRows(mappedData);

  return workbook.xlsx.writeBuffer();
};

module.exports = { generateXlsx };
