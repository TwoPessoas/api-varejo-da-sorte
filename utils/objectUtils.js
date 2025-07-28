const toSnakeCase = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

const snakeToCamel = (str) => {
  if (typeof str !== "string") {
    return str;
  }
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
};

const convertKeysToCamelCase = (data) => {
  // Adicionamos a verificação '&& !(data instanceof Date)'
  // para tratar datas como valores finais e não como objetos a serem percorridos.
  if (data === null || typeof data !== "object" || data instanceof Date) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => convertKeysToCamelCase(item));
  }

  return Object.keys(data).reduce((acc, key) => {
    const camelKey = snakeToCamel(key);
    const value = data[key];

    acc[camelKey] = convertKeysToCamelCase(value);

    return acc;
  }, {});
};

module.exports = {
  convertKeysToCamelCase,
  toSnakeCase,
  snakeToCamel,
};
