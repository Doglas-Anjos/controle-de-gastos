// Validacao no cliente com o RegExp do JS: cobre os erros comuns (parentese aberto, quantificador solto).
// A API (re do Python) continua sendo a palavra final; aqui so evita a ida e volta.
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern, "i");
    return null;
  } catch {
    return "Expressão inválida. Confira parênteses, colchetes e caracteres como * + ? que precisam de \\ antes.";
  }
}
