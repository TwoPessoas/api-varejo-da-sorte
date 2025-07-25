function slugify(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text
        .toString()
        .toLowerCase()
        
        // Passo 1: Normaliza a string para a forma NFD (Normalization Form Decomposed)
        // Isso separa os caracteres base de seus acentos (ex: 'é' vira 'e' + '´').
        .normalize('NFD') 
        
        // Passo 2: Remove os caracteres de acentuação (diacríticos), que estão no range Unicode U+0300 a U+036f.
        .replace(/[\u0300-\u036f]/g, '')
        
        // Passo 3: Substitui espaços por hífens.
        .replace(/\s+/g, '-')

        // Passo 4: Remove todos os caracteres que não são letras (a-z), números (0-9) ou hífens.
        // O \w em regex é um atalho para [A-Za-z0-9_], mas aqui somos mais explícitos.
        .replace(/[^\w\-]+/g, '')

        // Passo 5: Substitui hifens múltiplos por um único hífen.
        .replace(/\-\-+/g, '-')

        // Passo 6: Remove hifens que possam ter ficado no início ou no fim do texto.
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

module.exports = { slugify };