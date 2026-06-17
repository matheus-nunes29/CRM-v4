export type HSChecklist = {
  trafego: string[]
  entregas: string[]
  qualidade: string[]
  relacionamento: string[]
}

export const HS_TRAFEGO_ITEMS = [
  'Growthpack atualizado: indicadores (metas, funil, verba) preenchidos e revisados?',
  'Campanhas subiram corretamente: lançadas conforme o combinado na Sprint?',
  'Campanhas pausadas corretamente: ações especiais e temporárias pausadas no prazo?',
  'Verba de mídia controlada: gasto alinhado com o planejado, sem estouros?',
  'Público e criativos corretos: segmentações e anúncios conferem com a estratégia?',
  'UTMs mapeadas: campanhas têm rastreamento correto?',
  'Otimização e acompanhamento: houve acompanhamento ativo com ajustes relevantes?',
  'Regras de investimento: limites e parâmetros operacionais aplicados?',
]

export const HS_ENTREGAS_ITEMS = [
  'Backlog (tarefas do mês) projetado, visível e atualizado?',
  'As entregas do mês foram concluídas dentro do SLA acordado?',
  'Itens planejados na Sprint/Sprint Planning executados conforme combinado?',
  'Solicitações do cliente feitas durante a semana atendidas no prazo?',
  'Não houve reclamações do cliente quanto ao prazo ou atrasos recorrentes?',
]

export const HS_QUALIDADE_ITEMS = [
  'O CSAT mais recente está disponível e registrado?',
  'Houve solicitações de refação por parte do cliente na última semana?',
  'As refações foram ajustes mínimos (não estruturais)?',
  'UCM e DCC utilizados nas entregas?',
  'Coordenador validou se a entrega está aderente ao briefing e padrões?',
  'Cliente demonstrou satisfação nas interações sobre entregas recentes?',
]

export const HS_RELACIONAMENTO_ITEMS = [
  'Houve reunião 1:1 ou contato direto do coordenador esta semana?',
  'O cliente demonstrou engajamento, alinhamento e otimismo?',
  'Não foram identificados sinais de insatisfação ou reclamações recorrentes?',
  'O time percebe que o stakeholder principal entende o que é entregue?',
  'Nenhuma demanda foi levada à ouvidoria ou liderança nesta semana?',
]
