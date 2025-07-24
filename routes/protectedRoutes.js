const express = require('express');
const router = express.Router();
const {
    authenticateToken,
    authorizeRoles 
} = require('../middleware/authMiddleware');

// Rota protegida que exige apenas autenticação (qualquer usuário logado pode acessar)
router.get(
    '/profile',
    authenticateToken, (req, res) => {
    // Graças ao middleware, req.user está disponível aqui
    res.json({ message: 'Welcome to your profile!', user: req.user });
});

// Rota protegida que exige autenticação E o papel de 'admin'
router.get(
    '/admin-dashboard',
    authenticateToken,
    authorizeRoles('admin'),
    (req, res) => {
    res.json({ message: 'Welcome to the Admin Dashboard!' });
});

// Rota protegida que exige autenticação E papel de 'admin' OU 'manager'
router.post(
    '/manage-content',
    authenticateToken,
    authorizeRoles('admin', 'manager'), (req, res) => {
    res.json({ message: 'Content updated successfully.' });
});

module.exports = router;