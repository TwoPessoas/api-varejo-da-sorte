const { Pool } = require('pg');
// A biblioteca 'pg' usa um objeto de configuração ou uma 'connectionString'.
// Plataformas como Render e Heroku fornecem uma DATABASE_URL completa,
// que já contém usuário, senha, host, porta e nome do banco.
// O 'Pool' do pg reconhece essa variável de ambiente automaticamente.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Em produção, o Render pode exigir uma conexão SSL.
    // Esta configuração é a mais comum para garantir que funcione.
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Teste de conexão opcional, mas recomendado
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        // eslint-disable-next-line no-console
        console.error('Erro ao conectar com o PostgreSQL:', err);
    } else {
        // eslint-disable-next-line no-console
        console.log('Conexão com o PostgreSQL estabelecida com sucesso!');
    }
});

module.exports = pool;