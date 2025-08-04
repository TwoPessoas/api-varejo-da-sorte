/**
 * Recebe um objeto de cliente e retorna um novo objeto com os
 * dados sensíveis mascarados.
 *
 * @param {object} client - O objeto de cliente vindo do banco de dados.
 * @returns {object} - Um novo objeto de cliente com os dados mascarados.
 */
function clientMaskInfo(client) {
  if (!client) return null;

  // Cria uma cópia para não alterar o objeto original
  const clientMasked = { ...client };
  delete clientMasked.id;
  delete clientMasked.token;
  delete clientMasked.created_at;

  // Mascarar CPF: Exibe os 3 primeiros e os 2 últimos dígitos
  // Ex: 123.456.789-01 -> 123.###.###-01
  if (clientMasked.cpf) {
    clientMasked.cpf = clientMasked.cpf.replace(
      /(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/,
      "$1.###.###-$4"
    );
  }

  // Mascarar Email: Exibe os 2 primeiros caracteres do nome e o domínio
  // Ex: leonardo.santos@exemplo.com -> le############@exemplo.com
  if (clientMasked.email) {
    clientMasked.email = clientMasked.email.replace(
      /(.{2})(.*)(@.*)/,
      (_, g1, g2, g3) => g1 + "#".repeat(g2.length) + g3
    );
  }

  // Mascarar Celular: Exibe o DDD e os 4 últimos dígitos
  // Ex: (83) 98877-6655 -> (83) 9####-6655
  if (clientMasked.cel) {
    clientMasked.cel = clientMasked.cel.replace(
      /(\(\d{2}\)\s\d)(\d{4})(-)(\d{4})/,
      "$1####$3$4"
    );
  }

  // Mascarar Data de Nascimento: Oculta o ano
  // Ex: 1990-12-25 -> ####-12-25
  if (clientMasked.birthday) {
    // A data vem como um objeto Date do DB, convertemos para o formato ISO
    const dataISO = new Date(clientMasked.birthday).toISOString().split("T")[0];
    clientMasked.birthday = dataISO.replace(/^\d{4}/, "####");
  }

  return clientMasked;
}

module.exports = {
  clientMaskInfo,
};
