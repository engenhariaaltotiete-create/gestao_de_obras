// Valores iniciais das listas simples do formulário.
// Todos os campos usam pesquisa por qualquer trecho digitado; campos editáveis também aceitam novos valores.
export const BASE_OPTIONS = {
  cargo: ['Engenheiro', 'Encarregado', 'Fiscal', 'Líder'],
  empresa: ['Sabesp', 'Zigurate'],
  municipio: ['BIRITIBA-MIRIM', 'GUARAREMA', 'POÁ', 'SALESÓPOLIS', 'SUZANO'],
  tipoObra: ['PROLONGAMENTO', 'REMANEJAMENTO', 'CONSTRUÇÃO DE PV', 'CONSTRUÇÃO DE CAIXA', 'INSTALAÇÃO DE VÁLVULA'],
  aguaEsgoto: ['ÁGUA', 'ESGOTO'],
} as const;

export const RECEIPT_OPTIONS = {
  tipoObra: ['PROLONGAMENTO', 'REMANEJAMENTO', 'RENOVAÇÃO', 'CONSTRUÇÃO DE CAIXA', 'INSTALAÇÃO DE VENTOSA', 'INSTALAÇÃO DE VRP'],
  elemento: ['Rede', 'Ramal', 'PV', 'PI', 'Válvula', 'VRP', 'Descarga', 'Ventosa'],
  tipoDefeito: [
    'Vazamento', 'Tubulação danificada', 'Tubulação fora de especificação', 'Cobertura insuficiente da rede',
    'Declividade inadequada', 'Infiltração de água subterrânea', 'Rede em desacordo com projeto', 'Reaterro inadequado',
    'Interferência não tratada', 'Registro danificado', 'Caixa de registro danificada', 'Poço de visita danificado',
    'Poço de visita fora de padrão', 'Ligação irregular', 'Ventosa ausente', 'Ventosa danificada', 'Descarga ausente',
    'Descarga danificada', 'Bloco de ancoragem ausente', 'Bloco de ancoragem inadequado', 'Falha no teste hidrostático',
    'Recomposição de pavimento inadequada', 'Falta de pintura de ligação', 'Sarjeta danificada', 'Guia danificada',
    'Calçada danificada', 'Área não restaurada', 'Cadastro divergente',
  ],
  grau: ['Leve', 'Moderado', 'Grave'],
} as const;

export const DIAGNOSIS_OPTIONS = {
  municipio: ['SUZANO','POÁ','SALESÓPOLIS','BIRITIBA-MIRIM','GUARAREMA'],
  processo: ['ÁGUA','ESGOTO'],
  material: ['Ferro fundido','PVC','PEAD','fibrocimento','Aço'],
  simNaoNa: ['SIM','NÃO','NÃO SE APLICA'],
  simNao: ['SIM','NÃO'],
  tipoObra: ['Remanejamento','Prolongamento'],
  necessidade: ['no longo prazo','a médio prazo','a curto prazo','imediata'],
} as const;

export const PHOTO_OPTIONS={
  tipoRelatorio:['PRÉ-OBRA','ACOMPANHAMENTO DE OBRA','FINAL DE OBRA','OCORRÊNCIAS','SINISTRO'],
  tipoObra:['PROLONGAMENTO','REMANEJAMENTO','RENOVAÇÃO','CONSTRUÇÃO DE CAIXA','INSTALAÇÃO DE VENTOSA','INSTALAÇÃO DE VRP'],
} as const;

export const CHECKLIST_STATUS_OPTIONS = ['SIM','NÃO','NÃO SE APLICA'] as const;

export const CHECKLIST_DOCUMENTS = [
  ['Solicitação da obra / demanda','Ofício, CI, PMSB, Ouvidoria, Prefeitura etc.'],
  ['Diagnóstico','Exigidos para as obras de melhoria do sistema'],
  ['Projeto/Levantamento','Projeto ou levantamento contendo todas as interferências no local'],
  ['Checklist da COMGÁS','Em obras onde existam rede da COMGÁS'],
  ['Autorização ambiental','Quando aplicável'],
  ['Autorização de concessionárias','DER, Transpetro, MRS, etc...'],
  ['Autorização da secretaria de obras','Exigido somente no município de Suzano'],
  ['Autorização da secretaria de Trânsito','Exigido para todas as obras'],
  ['Relatório fotográfico inicial','Exigido para todas as obras'],
  ['Plano de sinalização específico','Conforme trânsito local'],
  ['Plano de Furo aprovado pela Sabesp','Devendo conter o levantamento de interferências (NTS 0324)'],
  ['Relatório de sondagens/cavas-testemunho','Conforme NTS 0324'],
  ['Equipe certificada (operador/navegador/soldador)','Conforme NTS 0324'],
  ['Certificação do navegador HDD','Conforme NTS 0324'],
  ['Certificação do soldador PEAD','Conforme NTS 0324'],
  ['APR','Conforme NTS 0324'],
  ['PAE','Conforme NTS 0324'],
] as const;


export const FINAL_WORK_DOCUMENTS = [
  ['Checklist de liberação de obra','Exigido para início de todas as obras'],
  ['Relatórios de fiscalização','Controle da contratada contendo todas as etapas'],
  ['Teste de estanqueidade','Somente para as obras de água'],
  ['Relatório de serviços não vinculados','Quando houver serviços não vinculados'],
  ['Relatório de Poços de Visita','Em obras que tenham PVs ou caixas deverá haver o relatório'],
  ['Registro de execução do furo','Obrigatório em obras em HDD, devendo conter: profundidade por haste, pitch (ângulo) por haste, sequência de alargamento e controle da carga de puxamento.'],
  ['Registro da utilização de Fuse Link ou dispositivo equivalente','Obrigatório em obras em HDD'],
  ['Relatório de ocorrências e desvios','Obrigatório em obras em HDD'],
] as const;
