function formatNumberWithZeros(number, length = 4) {
  // Validação de tipo
  if (typeof number !== 'number' || isNaN(number)) {
    throw new Error('Parâmetro deve ser um número válido');
  }
  
  // Garante que seja um inteiro
  const intNumber = Math.floor(number);
  
  return intNumber.toString().padStart(length, '0');
}

module.exports = { formatNumberWithZeros };