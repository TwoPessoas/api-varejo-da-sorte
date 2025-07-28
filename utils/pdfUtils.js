const PdfPrinter = require("pdfmake");

// Configuração das fontes para o PDFMake
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

// Função para gerar PDF de clientes
const generateClientsPDF = (clients, filters = {}, dateRange = {}) => {
  const printer = new PdfPrinter(fonts);

  // Preparar dados da tabela
  const tableBody = [
    // Cabeçalho da tabela
    [
      { text: "ID", style: "tableHeader" },
      { text: "Nome", style: "tableHeader" },
      { text: "CPF", style: "tableHeader" },
      { text: "Celular", style: "tableHeader" },
      { text: "Email", style: "tableHeader" },
      { text: "Pré-Cadastro", style: "tableHeader" },
      { text: "Criado Em", style: "tableHeader" },
    ],
  ];

  // Adicionar dados dos clientes
  clients.forEach((client) => {
    tableBody.push([
      { text: client.id.toString(), style: "tableCell" },
      { text: client.name || "-", style: "tableCell" },
      { text: client.cpf || "-", style: "tableCell" },
      { text: client.cel || "-", style: "tableCell" },
      { text: client.email || "-", style: "tableCell" },
      { text: client.is_pre_register ? "Sim" : "Não", style: "tableCell" },
      {
        text: client.created_at
          ? new Date(client.created_at).toLocaleDateString("pt-BR")
          : "-",
        style: "tableCell",
      },
    ]);
  });

  // Preparar informações de filtros aplicados
  const activeFilters = Object.entries(filters)
    .filter(([key, value]) => value && value.trim() !== "")
    .map(([key, value]) => `${key}: "${value}"`)
    .join(", ");

  // Preparar informação do período
  let periodInfo = "Todos os períodos";
  if (dateRange.startDate && dateRange.endDate) {
    periodInfo = `${new Date(dateRange.startDate).toLocaleDateString(
      "pt-BR"
    )} até ${new Date(dateRange.endDate).toLocaleDateString("pt-BR")}`;
  } else if (dateRange.startDate) {
    periodInfo = `A partir de ${new Date(
      dateRange.startDate
    ).toLocaleDateString("pt-BR")}`;
  } else if (dateRange.endDate) {
    periodInfo = `Até ${new Date(dateRange.endDate).toLocaleDateString(
      "pt-BR"
    )}`;
  }

  // Definição do documento PDF
  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape", // Paisagem para melhor visualização da tabela
    pageMargins: [40, 60, 40, 60],

    header: {
      margin: [40, 20, 40, 0],
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: "Relatório de Clientes",
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
      // Informações do relatório
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  { text: "Informações do Relatório", style: "subheader" },
                  {
                    text: `Total de registros: ${clients.length}`,
                    style: "info",
                  },
                  { text: `Período: ${periodInfo}`, style: "info" },
                  activeFilters
                    ? {
                        text: `Filtros aplicados: ${activeFilters}`,
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

      // Tabela de clientes
      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto", "auto", "*", "auto", "auto"],
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
      info: {
        fontSize: 10,
        color: "#64748b",
        margin: [0, 2, 0, 2],
      },
      tableHeader: {
        bold: true,
        fontSize: 10,
        color: "white",
        fillColor: "#4f46e5",
        alignment: "center",
        margin: [5, 5, 5, 5],
      },
      tableCell: {
        fontSize: 9,
        color: "#374151",
        margin: [5, 3, 5, 3],
      },
      footer: {
        fontSize: 8,
        color: "#6b7280",
        margin: [0, 5, 0, 0],
      },
    },

    defaultStyle: {
      font: "Roboto",
    },
  };

  return printer.createPdfKitDocument(docDefinition);
};

module.exports = {
  generateClientsPDF,
};
