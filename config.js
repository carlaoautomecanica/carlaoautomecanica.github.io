// Configurações da oficina.
// SUPABASE_URL e SUPABASE_ANON_KEY vêm do painel do Supabase (veja o README).
// Se ficarem vazias, o site funciona em MODO DE TESTE (dados só neste aparelho).
window.CONFIG = {
  NOME_OFICINA: "Carlão Auto Mecânica",

  // Aparecem no orçamento/recibo em PDF. Deixe "" para não mostrar.
  TELEFONE_OFICINA: "",
  ENDERECO_OFICINA: "",
  PIX: "",

  // Depois de quantos meses sem voltar o cliente aparece em "Hora da revisão".
  MESES_REVISAO: 6,

  SUPABASE_URL: "https://ncejybqjmhhupnusjbnv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_fzjbCNXMK8sC7UXMu_FOvg_Vw5KIUaC",
};
