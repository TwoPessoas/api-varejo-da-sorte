const pool = require('../config/db');

async function logActivity(userId, action, entity = {}, details = {}) {
    try {
        const sql = `
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
            VALUES ($1, $2, $3, $4, $5)`;
        
        const params = [
            userId, 
            action, 
            entity.type, // ex: 'invoices'
            entity.id,   // ex: 123
            details
        ];

        await pool.query(sql, params);
    } catch (error) {
        console.error('Falha ao gravar log de auditoria:', error);
    }
}

module.exports = { logActivity };