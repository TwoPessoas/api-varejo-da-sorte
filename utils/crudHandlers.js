const { toSnakeCase, convertKeysToCamelCase } = require("./objectUtils");

/**
 * Cria um conjunto de handlers CRUD genéricos para uma dada tabela do banco de dados.
 * @param {object} options
 * @param {object} options.pool - Pool de conexão PostgreSQL.
 * @param {string} options.tableName - Nome da tabela no banco de dados (ex: 'clients').
 * @param {string} [options.idField='id'] - Nome do campo da chave primária.
 * @param {string[]} options.creatableFields - Array de nomes de campos permitidos para criação (em camelCase).
 * @param {string[]} options.updatableFields - Array de nomes de campos permitidos para atualização (em camelCase).
 * @param {function} options.logActivity - Função utilitária para logging.
 * @param {object} [options.additionalLogic] - Ganchos opcionais para lógica customizada (ex: { preCreate: async (data) => data }).
 * @returns {object} Objeto contendo funções async handler para operações CRUD.
 */
const createCrudHandlers = ({
  pool,
  tableName,
  idField = "id",
  creatableFields,
  updatableFields,
  logActivity,
  additionalLogic = {},
  defaultOrderBy = "id",
  defaultOrderDirection = "ASC",
}) => {
  // Handler para GET ALL (Listagem com Paginação e Filtros)
  const getAll = async (req, res, next) => {
    try {
      // Importa dinamicamente para evitar circular dependency se queryBuilder também precisar de objectUtils
      const { buildQuery } = require("./queryBuilder");

      const {
        whereClause,
        params,
        currentPage,
        limit,
        offset,
        nextParamIndex,
      } = buildQuery({
        tableName,
        queryParams: req.query,
        searchableFields: creatableFields, // Usar campos criáveis para busca também (nome, cpf, etc.)
        enableDateFiltering: true, // Habilitar filtro por data de criação na listagem
        orderBy: req.query.orderBy || defaultOrderBy, // Permitir ordenação customizada
        orderDirection: req.query.orderDirection || defaultOrderDirection,
      });

      // Query para contagem total
      const countQuery = `SELECT COUNT(*) FROM ${tableName} ${whereClause}`;
      const countResult = await pool.query(countQuery, params);
      const totalEntities = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.ceil(totalEntities / limit);

      // Query principal com ordenação configurada
      const orderByField = toSnakeCase(req.query.orderBy || defaultOrderBy);
      const orderDirection = req.query.orderDirection || defaultOrderDirection;

      let query = `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${orderByField} ${orderDirection} LIMIT $${nextParamIndex} OFFSET $${
        nextParamIndex + 1
      }`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.status(200).json({
        status: "success",
        data: result.rows.map(convertKeysToCamelCase), // Converte chaves para camelCase para o frontend
        pagination: {
          totalEntities,
          totalPages,
          currentPage,
          limit,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Handler para GET BY ID (Buscar por ID)
  const getById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT * FROM ${tableName} WHERE ${toSnakeCase(idField)} = $1`,
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: `${
            tableName.charAt(0).toUpperCase() + tableName.slice(1)
          } não encontrado.`,
        });
      }
      res.status(200).json(convertKeysToCamelCase(rows[0]));
    } catch (error) {
      next(error);
    }
  };

  // Handler para POST (Criar Nova Entidade)
  const create = async (req, res, next) => {
    try {
      let data = req.body;
      if (additionalLogic.preCreate) {
        // Gancho para lógica customizada antes da criação
        data = await additionalLogic.preCreate(data);
      }

      const fields = creatableFields
        .map((field) => toSnakeCase(field))
        .join(", ");
      const values = creatableFields
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const params = creatableFields.map((field) => data[field]);

      const sql = `INSERT INTO ${tableName} (${fields}) VALUES (${values}) RETURNING *`;
      const result = await pool.query(sql, params);

      const createdEntity = convertKeysToCamelCase(result.rows[0]);

      await logActivity(
        req.user.id, // Supondo req.user.id disponível do middleware de autenticação
        `CREATE_${tableName.toUpperCase()}`,
        { type: tableName, id: createdEntity[idField] },
        { requestBody: req.body }
      );

      res.status(201).json({
        status: "success",
        message: `${
          tableName.charAt(0).toUpperCase() + tableName.slice(1)
        } criado com sucesso.`,
        data: createdEntity,
      });
    } catch (error) {
      next(error);
    }
  };

  // Handler para PUT (Atualizar Entidade Existente)
  const update = async (req, res, next) => {
    try {
      const { id } = req.params;
      let data = req.body;
      if (additionalLogic.preUpdate) {
        // Gancho para lógica customizada antes da atualização
        data = await additionalLogic.preUpdate(data);
      }

      const setClause = updatableFields
        .map((field, index) => `${toSnakeCase(field)} = $${index + 1}`)
        .join(", ");
      const params = updatableFields.map((field) => data[field]);
      params.push(id); // Adiciona o ID como o último parâmetro para a cláusula WHERE

      const sql = `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE ${toSnakeCase(
        idField
      )} = $${params.length} RETURNING *`;
      const result = await pool.query(sql, params);

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: "error",
          message: `${
            tableName.charAt(0).toUpperCase() + tableName.slice(1)
          } não encontrado.`,
        });
      }

      const updatedEntity = convertKeysToCamelCase(result.rows[0]);

      await logActivity(
        req.user.id,
        `UPDATE_${tableName.toUpperCase()}`,
        { type: tableName, id: updatedEntity[idField] },
        { requestBody: req.body }
      );

      res.status(200).json({
        status: "success",
        message: `${
          tableName.charAt(0).toUpperCase() + tableName.slice(1)
        } atualizado com sucesso.`,
        data: updatedEntity,
      });
    } catch (error) {
      next(error);
    }
  };

  // Handler para DELETE (Remover Entidade)
  const remove = async (req, res, next) => {
    // Renomeado de 'delete' para 'remove' para evitar conflito de palavra-chave
    try {
      const { id } = req.params;
      const result = await pool.query(
        `DELETE FROM ${tableName} WHERE ${toSnakeCase(idField)} = $1`,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          status: "error",
          message: `${
            tableName.charAt(0).toUpperCase() + tableName.slice(1)
          } não encontrado.`,
        });
      }

      await logActivity(
        req.user.id,
        `DELETE_${tableName.toUpperCase()}`,
        { type: tableName, id: id },
        { requestBody: req.body }
      );

      res.status(204).send(); // Status 204 indica sucesso sem conteúdo
    } catch (error) {
      next(error);
    }
  };

  return { getAll, getById, create, update, remove };
};

module.exports = { createCrudHandlers };
