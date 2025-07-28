const PdfPrinter = require("pdfmake");

// Configuração das fontes para o PDFMake (deve ser carregada apenas uma vez)
const fonts = {
  Roboto: {
    normal:
      require
        .resolve("pdfmake/build/vfs_fonts.js")
        .replace("vfs_fonts.js", "") + "Roboto-Regular.ttf",
    bold:
      require
        .resolve("pdfmake/build/vfs_fonts.js")
        .replace("vfs_fonts.js", "") + "Roboto-Medium.ttf",
    italics:
      require
        .resolve("pdfmake/build/vfs_fonts.js")
        .replace("vfs_fonts.js", "") + "Roboto-Italic.ttf",
    bolditalics:
      require
        .resolve("pdfmake/build/vfs_fonts.js")
        .replace("vfs_fonts.js", "") + "Roboto-MediumItalic.ttf",
  },
};

const printer = new PdfPrinter(fonts);

/**
 * Gera um documento PDF a partir de um array de dados.
 * @param {Array<Object>} data - Array de objetos a serem exportados.
 * @param {Array<Object>} columns - Array de definições de coluna ({ key, header, width? }).
 * @param {Object} reportFilters - Objeto contendo os filtros de busca e data parseados (do queryBuilder).
 * @param {string} tableName - Nome da tabela sendo exportada (para o título do relatório).
 * @returns {PDFKit.PDFDocument} O objeto do documento PDF (stream).
 */
const generatePdf = (data, columns, reportFilters, tableName) => {
  // Prepara o corpo da tabela baseado nas colunas fornecidas
  const tableBody = [
    columns.map((col) => ({ text: col.header, style: "tableHeader" })),
  ];

  data.forEach((row) => {
    tableBody.push(
      columns.map((col) => {
        let value = row[col.key];
        // Heurística para campos de data
        if (
          col.key.includes("_at") ||
          col.key === "birthday" ||
          col.key.includes("Date")
        ) {
          value = value ? new Date(value).toLocaleDateString("pt-BR") : "-";
        } else if (typeof value === "boolean") {
          value = value ? "Sim" : "Não";
        } else if (value === null || value === undefined) {
          value = "-";
        }
        return { text: String(value), style: "tableCell" };
      })
    );
  });

  // Prepara informações de filtros para o PDF
  const activeSearchFilters = Object.entries(reportFilters.search || {})
    .filter(([, value]) => value && String(value).trim() !== "") // Garante que o valor não seja vazio
    .map(([key, value]) => `${key}: "${value}"`);

  let periodInfo = "Todos os períodos";
  if (reportFilters.startDate && reportFilters.endDate) {
    periodInfo = `${new Date(reportFilters.startDate).toLocaleDateString(
      "pt-BR"
    )} até ${new Date(reportFilters.endDate).toLocaleDateString("pt-BR")}`;
  } else if (reportFilters.startDate) {
    periodInfo = `A partir de ${new Date(
      reportFilters.startDate
    ).toLocaleDateString("pt-BR")}`;
  } else if (reportFilters.endDate) {
    periodInfo = `Até ${new Date(reportFilters.endDate).toLocaleDateString(
      "pt-BR"
    )}`;
  }

  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [40, 60, 40, 60],

    header: {
      margin: [40, 20, 40, 0],
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: `Relatório de ${
                tableName.charAt(0).toUpperCase() + tableName.slice(1)
              }s`, // Ex: "Relatório de Clients"
              style: "header",
              alignment: "center",
              border: [false, false, false, true],
              borderColor: "#cccccc",
            },
          ],
        ],
      },
    },

    footer: function (currentPage, pageCount) {
      return {
        margin: [40, 0, 40, 20],
        table: {
          widths: ["*", "*"],
          body: [
            [
              {
                text: `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
                style: "footer",
                border: [false, true, false, false],
                borderColor: "#cccccc",
              },
              {
                text: `Página ${currentPage} de ${pageCount}`,
                style: "footer",
                alignment: "right",
                border: [false, true, false, false],
                borderColor: "#cccccc",
              },
            ],
          ],
        },
      };
    },

    content: [
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  { text: "Informações do Relatório", style: "subheader" },
                  { text: `Total de registros: ${data.length}`, style: "info" },
                  { text: `Período: ${periodInfo}`, style: "info" },
                  activeSearchFilters.length > 0
                    ? {
                        text: `Filtros aplicados: ${activeSearchFilters.join(
                          ", "
                        )}`,
                        style: "info",
                      }
                    : null,
                ].filter(Boolean),
                border: [true, true, true, true],
                borderColor: "#dddddd",
                fillColor: "#f9f9f9",
                margin: [10, 10, 10, 10],
              },
            ],
          ],
        },
        margin: [0, 0, 0, 20],
      },
      {
        table: {
          headerRows: 1,
          widths: columns.map((col) => col.width || "auto"), // Usa largura definida ou 'auto'
          body: tableBody,
        },
        layout: {
          fillColor: function (rowIndex, node, columnIndex) {
            return rowIndex === 0
              ? "#4f46e5"
              : rowIndex % 2 === 0
              ? "#f8fafc"
              : null;
          },
          hLineWidth: function (i, node) {
            return i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5;
          },
          vLineWidth: function (i, node) {
            return 0.5;
          },
          hLineColor: function (i, node) {
            return "#e2e8f0";
          },
          vLineColor: function (i, node) {
            return "#e2e8f0";
          },
        },
      },
    ],

    styles: {
      header: {
        fontSize: 18,
        bold: true,
        color: "#1e293b",
        margin: [0, 0, 0, 10],
      },
      subheader: {
        fontSize: 14,
        bold: true,
        color: "#334155",
        margin: [0, 0, 0, 8],
      },
      info: { fontSize: 10, color: "#64748b", margin: [0, 2, 0, 2] },
      tableHeader: {
        bold: true,
        fontSize: 10,
        color: "white",
        fillColor: "#4f46e5",
        alignment: "center",
        margin: [5, 5, 5, 5],
      },
      tableCell: { fontSize: 9, color: "#374151", margin: [5, 3, 5, 3] },
      footer: { fontSize: 8, color: "#6b7280", margin: [0, 5, 0, 0] },
    },
    defaultStyle: { font: "Roboto" },
  };

  return printer.createPdfKitDocument(docDefinition);
};

module.exports = { generatePdf };
