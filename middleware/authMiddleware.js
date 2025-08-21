// middleware/authMiddleware.js

const jwt = require("jsonwebtoken");

/**
 * Middleware para autenticar o token JWT.
 * Ele verifica o token JWT enviado no header 'Authorization' da requisição.
 * Se o token for válido, decodifica o payload (informações do usuário) e
 * o anexa ao objeto `req` (em `req.user`) para uso posterior nos controladores.
 * Se o token for inválido ou ausente, a requisição é bloqueada.
 *
 * @param {object} req - O objeto de requisição do Express.
 * @param {object} res - O objeto de resposta do Express.
 * @param {Function} next - A função para chamar o próximo middleware na cadeia.
 */
const authenticateToken = (req, res, next) => {
    // Padrão comum para enviar o token: Bearer <TOKEN>
    const authHeader = req.headers["authorization"];
    //console.log('[authenticateToken][0] authHeader = ', authHeader);
    const token = authHeader && authHeader.split(" ")[1]; // Extrai o token
    //console.log('[authenticateToken][1] token = ', {token, secret: process.env.JWT_SECRET});

    if (!token) {
        // Se não há token, retorna 401 Unauthorized
        return res.status(401).json({
            status: "error",
            message: "Access Denied. No token provided.",
        });
    }

    // Verifica a validade do token
    jwt.verify(token, process.env.JWT_SECRET, (err, decodedPayload) => {
        if (err) {
            // Se o token for inválido (expirado, assinatura incorreta), retorna 403 Forbidden
            // Usamos o 'next(err)' para que o errorHandler centralizado possa tratar o erro.
            // Isso mantém o código mais limpo e centraliza a lógica de erros.
            return next(err);
        }

        // Token é válido! Anexa o payload decodificado ao request.
        // O payload deve conter informações do usuário, como id e roles,
        // que foram definidas no momento da criação do token (no login).
        req.user = decodedPayload;

        // Passa para o próximo middleware ou para o controlador da rota.
        next();
    });
};

/**
 * Middleware de autorização baseado em papéis (roles).
 * Este é um exemplo de como restringir o acesso a rotas específicas
 * apenas para usuários com determinados papéis.
 *
 * Ele deve ser usado *após* o middleware `authenticateToken`.
 *
 * @param {...string} allowedRoles - Uma lista de strings representando os papéis permitidos.
 * @returns {Function} - Retorna uma função de middleware do Express.
 */
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // Assume que authenticateToken já foi executado e req.user existe.
        if (!req.user || !req.user.roles) {
            return res.status(500).json({
                status: "error",
                message: "Authentication error: User data not found in token.",
            });
        }

        const userRoles = req.user.roles; // Ex: ['user', 'editor']

        //console.log('user roles', {userRoles, allowedRoles});

        // Verifica se o array de papéis do usuário inclui pelo menos um dos papéis permitidos.
        const hasRequiredRole = userRoles.some((role) =>
            allowedRoles.includes(role)
        );

        if (!hasRequiredRole) {
            // Se o usuário não tem o papel necessário, retorna 403 Forbidden
            return res.status(403).json({
                status: "error",
                message: "Access Denied: You do not have the required permissions.",
            });
        }

        // Se o usuário tem a permissão, continua para a próxima função.
        next();
    };
};

module.exports = {
    authenticateToken,
    authorizeRoles,
};