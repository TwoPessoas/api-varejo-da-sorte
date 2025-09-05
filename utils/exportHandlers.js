const { buildQuery } = require("./queryBuilder");
const { generateCsv } = require("./exportGenerators/csv");
const { generateXlsx } = require("./exportGenerators/xlsx");
const { generatePdf } = require("./exportGenerators/pdf");

/**
 * Cria um handler de exportação genérico para uma dada tabela do banco de dados.
 * @param {object} options
 * @param {object} options.pool - Pool de conexão PostgreSQL.
 * @param {string} options.tableName - Nome da tabela no banco de dados (ex: 'clients').
 * @param {function} options.logActivity - Função utilitária para logging.
 * @param {Array<Object>} options.columnsConfig - Array de definições de coluna para exportação ({ key, header, width? }).
 * @param {string[]} options.searchableFields - Campos permitidos para busca/filtro na query de exportação.
 * @returns {function} Uma função middleware do Express.js para a rota de exportação.
 */
const createExportHandler = ({
  pool,
  tableName,
  logActivity,
  columnsConfig,
  searchableFields,
  getExportDataQuery, // Novo parâmetro para uma função de busca customizada
}) => {
  return async (req, res, next) => {
    try {
      const { search, startDate, endDate, format = "csv" } = req.query;

      // Usar queryBuilder para construir a cláusula WHERE e os parâmetros
      const { whereClause, params, filterParamsForLog } = buildQuery({
        tableName,
        queryParams: { search, startDate, endDate },
        searchableFields,
        enableDateFiltering: true, // Sempre habilitar filtragem por data para exportação
      });

      let dataToExport;

      // Se uma função de busca customizada for fornecida, use-a
      if (getExportDataQuery) {
        dataToExport = await getExportDataQuery({ whereClause, params });
      } else {
        // Caso contrário, use a query padrão
        const sql = `SELECT * FROM ${tableName} ${whereClause} ORDER BY id ASC`;
        const result = await pool.query(sql, params);
        dataToExport = result.rows;
      }

      await logActivity(
        req.user.id, // Supondo req.user.id disponível do middleware de autenticação
        `EXPORT_${tableName.toUpperCase()}`,
        { type: `${tableName}_export`, filters: req.query },
        { exportedCount: dataToExport.length }
      );

      let buffer;
      let contentType;
      let filename;

      switch (format) {
        case "csv":
          buffer = await generateCsv(dataToExport, columnsConfig);
          contentType = "text/csv";
          filename = `${tableName}_export.csv`;
          break;
        case "xlsx":
          buffer = await generateXlsx(dataToExport, columnsConfig);
          contentType =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          filename = `${tableName}_export.xlsx`;
          break;
        case "pdf":
          // A geração de PDF retorna um stream, precisa ser "piped" diretamente para a resposta
          const pdfDoc = generatePdf(
            dataToExport,
            columnsConfig,
            filterParamsForLog,
            tableName
          );
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${tableName}_export.pdf"`
          );
          pdfDoc.pipe(res);
          pdfDoc.end();
          return; // Sai daqui pois a resposta já está sendo enviada via pipe

        default:
          return res.status(400).json({
            status: "error",
            message: "Formato de exportação inválido.",
          });
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { createExportHandler };
