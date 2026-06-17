export type ChurnRiskConfig = {
  quedaConsecutivaSemanas: number
  quedaConsecutivaPontos: number
  quedaPontos: number
  hsCriticoLimite: number
  hsCriticoPontos: number
  hsBaixoLimite: number
  hsBaixoPontos: number
  semHsPontos: number
  semAtualizacaoCriticoDias: number
  semAtualizacaoCriticoPontos: number
  semAtualizacaoAtencaoDias: number
  semAtualizacaoAtencaoPontos: number
  semProjetosPontos: number
  altoLimite: number
  medioLimite: number
}

export const DEFAULT_CHURN_CONFIG: ChurnRiskConfig = {
  quedaConsecutivaSemanas: 3,
  quedaConsecutivaPontos: 2,
  quedaPontos: 1,
  hsCriticoLimite: 5,
  hsCriticoPontos: 2,
  hsBaixoLimite: 7,
  hsBaixoPontos: 1,
  semHsPontos: 2,
  semAtualizacaoCriticoDias: 30,
  semAtualizacaoCriticoPontos: 2,
  semAtualizacaoAtencaoDias: 14,
  semAtualizacaoAtencaoPontos: 1,
  semProjetosPontos: 1,
  altoLimite: 4,
  medioLimite: 2,
}

interface HSEntry { score_total: number | string; semana: string }
interface ProjetoLike { status: string }
type RiskLevel = 'baixo' | 'medio' | 'alto'

export function computeChurnRisk(
  entries: HSEntry[],
  projetos: ProjetoLike[],
  cfg: ChurnRiskConfig = DEFAULT_CHURN_CONFIG
): { level: RiskLevel; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const scores = entries.slice(0, cfg.quedaConsecutivaSemanas + 1).map(e => Number(e.score_total))

  // Queda consecutiva por N semanas
  let consecutiveDown = scores.length >= cfg.quedaConsecutivaSemanas
  if (consecutiveDown) {
    for (let i = 0; i < cfg.quedaConsecutivaSemanas - 1; i++) {
      if (scores[i] >= scores[i + 1]) { consecutiveDown = false; break }
    }
  }
  if (consecutiveDown) {
    score += cfg.quedaConsecutivaPontos
    reasons.push(`HS em queda por ${cfg.quedaConsecutivaSemanas} semanas`)
  } else if (scores.length >= 2 && scores[0] < scores[1]) {
    score += cfg.quedaPontos
    reasons.push('HS em queda')
  }

  // Limiar do HS
  if (scores.length > 0 && scores[0] < cfg.hsCriticoLimite) {
    score += cfg.hsCriticoPontos
    reasons.push('HS crítico')
  } else if (scores.length > 0 && scores[0] < cfg.hsBaixoLimite) {
    score += cfg.hsBaixoPontos
    reasons.push(`HS abaixo de ${cfg.hsBaixoLimite}`)
  }

  // Sem health score / sem atualização recente
  if (entries.length === 0) {
    score += cfg.semHsPontos
    reasons.push('Sem health score')
  } else {
    const days = Math.floor((Date.now() - new Date(entries[0].semana).getTime()) / 86400000)
    if (days > cfg.semAtualizacaoCriticoDias) {
      score += cfg.semAtualizacaoCriticoPontos
      reasons.push(`Sem atualização há ${days}d`)
    } else if (days > cfg.semAtualizacaoAtencaoDias) {
      score += cfg.semAtualizacaoAtencaoPontos
      reasons.push(`Sem atualização há ${days}d`)
    }
  }

  // Sem projetos ativos
  const activeProjects = projetos.filter(p => p.status === 'ativo')
  if (projetos.length > 0 && activeProjects.length === 0) {
    score += cfg.semProjetosPontos
    reasons.push('Sem projetos ativos')
  }

  return {
    level: score >= cfg.altoLimite ? 'alto' : score >= cfg.medioLimite ? 'medio' : 'baixo',
    reasons,
  }
}
