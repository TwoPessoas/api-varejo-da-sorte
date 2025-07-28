const { toSnakeCase } = require("./objectUtils"); // Assumindo que objectUtils.js exporta toSnakeCase

/**
 * Constrói cláusulas WHERE dinâmicas e parâmetros de paginação para queries SQL.
 * @param {object} options
 * @param {string} options.tableName - O nome da tabela (ex: 'clients').
 * @param {object} options.queryParams - Os parâmetros de query de req.query (ex: { search: '{ "name": "leo" }', page: '1', limit: '10' }).
 * @param {string[]} options.searchableFields - Array de campos que podem ser pesquisados (ex: ['name', 'cpf']).
 * @param {boolean} [options.enableDateFiltering=false] - Se deve incluir filtragem por created_at (datas).
 * @param {string} [options.orderBy='id'] - Campo padrão para ordenação.
 * @param {string} [options.orderDirection='ASC'] - Direção padrão da ordenação.
 * @returns {object} { whereClause, params, currentPage, limit, offset, nextParamIndex, filterParamsForLog }
 */
const buildQuery = (options) => {
  const {
    tableName,
    queryParams,
    searchableFields,
    enableDateFiltering = false,
    orderBy = "id",
    orderDirection = "ASC",
  } = options;

  let whereClause = " WHERE 1=1 ";
  const params = [];
  let paramIndex = 1; // Para rastrear a indexação de parâmetros do PostgreSQL ($1, $2, etc.)

  const { search, page, limit, startDate, endDate } = queryParams;

  let searchFilters = {};
  try {
    if (search) {
      searchFilters = JSON.parse(search);
    }
  } catch (e) {
    console.warn(
      `[QueryBuilder] JSON de busca inválido para ${tableName}:`,
      search
    );
    // Em produção, você pode lançar um erro ou retornar um status de erro.
  }

  // Armazena parâmetros de filtro para logging/resumo de exportação
  const filterParamsForLog = { search: searchFilters }; // Guarda o objeto searchFilters parseado

  // Aplica filtros gerais de busca
  searchableFields.forEach((field) => {
    const value = searchFilters[field];
    if (value !== undefined && value !== null && value !== "") {
      const snakeKey = toSnakeCase(field);
      whereClause += ` AND ${snakeKey}::text ILIKE $${paramIndex}`;
      params.push(`%${value}%`);
      paramIndex++;
    }
  });

  // Aplica filtros de range de data se habilitado
  if (enableDateFiltering) {
    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(new Date(startDate).toISOString());
      filterParamsForLog.startDate = startDate;
      paramIndex++;
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(endOfDay.toISOString());
      filterParamsForLog.endDate = endDate;
      paramIndex++;
    }
  }

  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 10;
  const offset = (parsedPage - 1) * parsedLimit;

  return {
    whereClause,
    params,
    currentPage: parsedPage,
    limit: parsedLimit,
    offset,
    orderBy: toSnakeCase(orderBy),
    orderDirection,
    nextParamIndex: paramIndex, // Próximo índice disponível para parâmetros adicionais (limit/offset)
    filterParamsForLog, // Filtros de busca e data parseados
  };
};

module.exports = { buildQuery };
