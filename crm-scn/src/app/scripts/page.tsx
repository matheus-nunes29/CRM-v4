'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Pencil, Save, X, ChevronDown, ChevronRight, RotateCcw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import CRMLayout from '../_components/CRMLayout'
import { R, WHITE, GRAY1, GRAY2, GRAY3, GRAY4, GREEN } from '@/lib/crm-constants'

const BORDER = '#E5E7EB'
const BLUE   = '#3B82F6'

// ─── Conteúdo padrão ──────────────────────────────────────────────────────────

const DEFAULT_SCRIPTS: Record<string, string> = {
  // ── INBOUND ──
  'inbound-ace-script':
`Bom dia/Boa tarde, [LEAD], aqui é o Lucca da V4 Company. Primeiro, agradeço seu tempo e interesse em falar com a gente da V4. Só para checar, nossa conversa vai tomar apenas 5 minutos, ok? O objetivo aqui é entender o contexto da sua empresa, mapear gargalos e, se fizer sentido tanto pra você quanto pra gente, vamos agendar um papo mais profundo com um de nossos especialistas. Combinado?`,

  'inbound-situation-script-0': `Me conta um pouco mais sobre o modelo de negócio da [Empresa].`,
  'inbound-situation-script-1': `Como seus clientes encontram vocês hoje?`,
  'inbound-situation-script-2': `Vocês já investem em mídia paga ou dependem somente de indicação?`,
  'inbound-situation-script-3': `Fulano, para valer a pena nosso trabalho, qual é a sua meta de faturamento mensal para o final do ano? Onde você quer chegar?`,
  'inbound-situation-script-4': `Perfeito. E para eu entender o tamanho do desafio e desenhar o plano para chegar nesses 400k... quanto você está faturando hoje?`,
  'inbound-situation-script-5': `Entendi. Então nosso desafio é cobrir esse gap de 150k nos próximos meses. Faz sentido?`,

  'inbound-pain-script-0': `O que te motivou a preencher nosso formulário agora?`,
  'inbound-pain-script-1': `Qual o principal gargalo que impede vocês de crescerem hoje?`,
  'inbound-pain-script-2': `O que está faltando para você sair do faturamento X e chegar na meta Y?`,

  'inbound-checkpoint-script-0': `Fulano, deixa ver se entendi bem. Vocês têm uma operação de 50 funcionários, faturam X, mas o crescimento estagnou porque dependem 100% de indicação e não têm um processo previsível de vendas. É exatamente isso ou deixei passar algo?`,
  'inbound-checkpoint-script-1': `Pode ficar tranquilo porque a sua situação é muito comum. Na nossa experiência com mais de 30 mil empresas parceiras, um dos maiores gargalos para negócios que são líderes de mercado, mas com uma presença digital abaixo do potencial, é justamente a falta de um plano estratégico que seja integrado à execução tática. A V4 se encaixa nesse exato ponto.`,

  'inbound-impact-script-0': `Se continuarem no ritmo atual, sem resolver esse gargalo de leads, quanto tempo levaria para baterem a meta anual/chegar nesse faturamento?`,
  'inbound-impact-script-1': `E se implementarmos essa estrutura de aquisição, em quanto tempo você acredita que chegamos lá?`,
  'inbound-impact-script-2': `Como isso afeta a sua rotina pessoalmente? Você consegue sair da operação?`,

  'inbound-ce-script-0': `Para quando você precisa disso resolvido?`,
  'inbound-ce-script-1': `Por que exatamente 20 dias? O que acontece nessa data?`,
  'inbound-ce-script-2': `E o que acontece se chegar nessa data e isso não estiver resolvido?`,

  'inbound-decision-script-0': `Além de você, existe algum sócio ou diretor que precisa validar esse projeto?`,
  'inbound-decision-script-1': `Como funciona o processo de aprovação aí? Passa por jurídico/financeiro?`,
  'inbound-decision-script-2': `Tem alguém que poderia "vetar" o projeto se não estiver na reunião?`,
  'inbound-decision-script-3': `Quais são os critérios principais para você fechar com uma assessoria de marketing e vendas? Preço, experiência no nicho, ou outra coisa?`,

  'inbound-agendamento-script': `Fulano, baseado nessa {dor que lead citou} que você me falou, eu identifiquei que o Vitor é nosso melhor especialista para desenhar um plano para resolver isso.\n\nO objetivo é te entregar um diagnóstico e mostrar como empresas parecidas com a sua resolveram isso. Se fizer sentido, avançamos. Se não, você sai com o plano.\n\nPara essa reunião ser produtiva, eu preciso que você reserve 45 minutos sem interrupções. Conseguimos esse compromisso?`,

  'inbound-confirmacao-script': `Mandei o convite no seu e-mail agora. Consegue abrir aí e me confirmar se chegou? Preciso que você clique em "Sim/Aceitar" para o sistema travar a agenda do especialista, senão o horário cai.`,

  // ── Pontes ──
  'inbound-pontes-sp': `Fulano, entendi que hoje sua operação funciona [Resumo da Situação]. Nesse cenário atual, o que te fez buscar a V4 agora? Onde está apertando?`,
  'inbound-pontes-pi': `Imagino que esse problema de [Problema citado] esteja atrapalhando bastante. Se a gente não resolver isso hoje, qual o impacto lá no final do ano na sua meta de receita?`,
  'inbound-pontes-ice': `Dado que você está deixando de ganhar [Impacto citado] por mês, para quando você precisa disso resolvido antes que comprometa seu ano?`,
  'inbound-pontes-ced': `Para garantirmos que tudo esteja rodando até a [Data do Evento Crítico], a gente precisa correr. Quem mais precisa aprovar esse projeto para não perdermos esse prazo?`,

  // ── RECOVERY ──
  'recovery-ace-script-0': `Bom dia/Boa Tarde Fulano, aqui é o Lucca, sou especialista em estratégias de crescimento na V4 Company.\n\nO motivo da minha ligação é que estou liderando uma reavaliação estratégica de algumas empresas que demonstraram interesse em nossas soluções de marketing e vendas no passado, e o nome da EMPRESA DO FULANO surgiu como prioridade aqui pra mim.\n\nMeu objetivo hoje não é olhar para trás. Eu quero fazer uma atualização do seu cenário atual para entender se faz sentido retomarmos alguma conversa.`,
  'recovery-ace-script-1': `Bom dia, Fulano, tudo bem?\n\nFulano, na verdade você não me conhece, mas eu sou Supervisor aqui na V4 Company. Você se lembra de ter falado conosco? Eu estou liderando aqui uma reavaliação de algumas empresas que falaram conosco e para entender o que aconteceu na época para não ter dado seguimento. Você se recorda do que aconteceu?\n\nMeu objetivo não é olhar para trás, mas entender se seu cenário atual de marketing e vendas ainda bate com o que entregamos. Se houver fit e o momento for ideal, damos seguimento; do contrário, paramos por aqui. Tudo bem?`,
  'recovery-ace-script-2': `Bom dia, Fulano, tudo bem?\n\nVocê não me conhece, sou o Lucca do time de Projetos da V4.\n\n[Nome], estou liderando uma reavaliação estratégica aqui e a [Empresa] surgiu como prioridade. Meu objetivo não é olhar para trás, mas entender se seu cenário atual de marketing e vendas ainda converge com o que entregamos. Se houver fit, ajustamos os próximos passos.`,
  'recovery-ace-script-3': `Bom dia, X. Aqui é o Lucca, do time de projetos da V4. Tudo bem?\n\nSou responsável por mapear empresas com grande potencial de gerar resultado com a V4 e encontrei a sua. Gostaria de entender se aconteceu algo para você não seguir o projeto na época?`,
  'recovery-situation-script': `Para eu atualizar minha base e não me basear em dados antigos: como está estruturado o seu time de vendas e marketing hoje? Mudou algo relevante da última conversa para cá?`,

  // ── RECOMENDAÇÃO ──
  'recomendacao-ace-script': `Bom dia/Boa Tarde Fulano, aqui é o Lucca, sou especialista em estratégias de crescimento na V4 Company.\n\nA gente está desenvolvendo um projeto para [PESSOA QUE DEU A RECOMENDAÇÃO] e ele/a até me insistiu para que eu te ligasse. Ele chegou a te falar que eu ligaria?\n\nPerfeito, deve estar bem corrido para ele/a.\n\nMeu objetivo é entender se existe alguma maneira que a gente possa aumentar seu faturamento como fazemos na [EMPRESA DO LEAD QUE RECOMENDOU].\n\nEu só preciso de 5 minutos do seu tempo. Combinado?`,
  'recomendacao-situation-script': `Como está estruturado o seu time de marketing e vendas hoje? Vocês têm uma equipe interna ou já contam com algum parceiro/agência?`,

  // ── PROSPECÇÃO ATIVA ──
  'prospeccao-ace-script': `Bom dia/Boa Tarde Fulano, aqui é o Lucca, sou especialista em estratégias de crescimento na V4 Company.\n\nA gente está desenvolvendo um projeto para [REFERÊNCIA] e ele/a até me insistiu para que eu te ligasse. Ele chegou a te falar que eu ligaria?\n\nMeu objetivo é entender se existe alguma maneira que a gente possa aumentar seu faturamento como fazemos na [EMPRESA REFERENCIADA].\n\nEu só preciso de 5 minutos do seu tempo. Combinado?`,
  'prospeccao-situation-script': `Como está estruturado o seu time de marketing e vendas hoje? Vocês têm uma equipe interna ou já contam com algum parceiro/agência?`,

  // ── SCRIPT COMPLEMENTAR ──
  'complementar-ac-script': `Fulano? Aqui é o Lucca da V4. Sábado de manhã, serei cirúrgico para não tomar seu tempo.`,
  'complementar-e-script': `No ano passado nós conversamos sobre tracionar as suas vendas. O motivo de eu te ligar hoje, no final do trimestre, é que eu desenhei um modelo focado puramente em aumento de receita para empresas do seu porte...`,
  'complementar-takeaway-script': `...Mas, sendo bem transparente, com você eu não sei se a sua operação atual tem estrutura para suportar isso hoje. Para eu não te tomar tempo à toa com algo que não encaixa: hoje, como está estruturada a sua máquina de vendas para bater a meta desse ano?`,
}

const DEFAULT_OBJECTIONS: Objection[] = [
  { id:'obj-1', titulo:'Já tenho agência!', momento:'Pré qualificação', tipo:'Concepção errada',
    completa:`Ótimo lead, por que nós não somos uma agência! Na verdade, somos uma assessoria de marketing, focada em vendas, então nós olhamos de forma estratégica para toda a jornada do teu cliente, desde o momento em que tua marca aparece para novas pessoas, até o momento em que elas compram de ti, fazendo com que teu digital se torne uma máquina de vendas, através de processos bem estruturados. Por exemplo, como acontecem tuas vendas hoje?`,
    simplificada:`Ótimo lead, por que nós não somos uma agência! Na verdade nós somos uma assessoria de marketing e vendas, e nós chegaríamos para complementar o que essa agência vem fazendo hoje. Por exemplo, o que eles fazem especificamente contigo? Qual o trabalho deles contigo?` },
  { id:'obj-2', titulo:'Já tenho agência e estou satisfeito', momento:'Pré qualificação', tipo:'Ceticismo',
    completa:`Cara, que bom, de verdade, já dá pra ver que você está bem focado no digital, e que vem investindo nisso! Então me conta, como que está o teu CAC? E o teu LTV? Quantos leads chegam por mês, e quanto vocês fecham em vendas?`,
    simplificada:`Cara, perfeito, isso é ótimo, mas em relação aos teus resultados em VENDAS, tu tem isso tudo metrificado, de ponta a ponta do funil?` },
  { id:'obj-3', titulo:'Já faço trabalho offline com bons resultados', momento:'Pré qualificação', tipo:'Concepção errada',
    completa:`Cara, excelente, o meu papel aqui não seria acabar com o que tu já vem fazendo, mas na verdade, é complementar. Como se tua operação fosse um avião, e você estivesse explorando a turbina do offline muito bem, mas a do online estivesse ainda parada. Com isso, meu papel seria acelerar essa outra turbina, para que o teu avião pudesse voar mais alto! O que você acha, o avião voa melhor com uma, ou com duas turbinas?`,
    simplificada:`Cara, excelente, que bom que teu offline tá funcionando, pois meu papel é conseguir te ajudar no online, e fazer com que esse mesmo resultado seja em dobro, aliando essas duas formas e aumentando as tuas vendas. Tu acha que ter esse teu desempenho hoje, também no online, faz sentido pra ti?` },
  { id:'obj-4', titulo:'Conheço uma empresa que faz tudo', momento:'Pré qualificação', tipo:'Real problema',
    completa:`Massa lead, isso é algo que todo dia eu escuto, e sempre dou a mesma resposta. Você conhece a analogia do pato? O pato é um animal que faz tudo, ele nada, ele anda, ele voa... mas o pato não é o melhor em nada do que faz. É o mesmo caso da V4: nós escolhemos olhar apenas para o marketing voltado a vendas, e como melhorá-lo, para realmente sermos especialistas em ajudar as empresas a venderem mais. Para voar mais alto nas vendas, tu prefere o pato, ou a águia?`,
    simplificada:`Perfeito, esse é um exemplo da diferença entre um profissional generalista e um especialista. Por exemplo: se tu tem um problema de saúde no coração, para resolvê-lo, você prefere ir em um clínico geral, ou em um cardiologista? A mesma coisa é com a V4: se o teu problema hoje é relacionado a aumentar as vendas, nós somos os especialistas para isso. Fez sentido?` },
  { id:'obj-5', titulo:'Deve ser bem caro, né?', momento:'Pré qualificação', tipo:'Concepção errada',
    completa:`Olha lead, o que eu posso te garantir, é que tudo que fazemos, e toda nossa equipe que estará a tua disposição executando o projeto, será de um investimento menor que um funcionário CLT. E além disso, essa equipe não fica doente, e nem te coloca na justiça, hahah.`,
    simplificada:`Então, quanto a isso você pode ficar despreocupado, por que nós atendemos desde empresas de médio porte até grandes players do mercado como Arezzo, Spotify, Melissa, Smart Fit, etc.` },
  { id:'obj-6', titulo:'Como posso ter certeza que terei retorno?', momento:'Qualificação', tipo:'Ceticismo',
    completa:`Cara, se eu te prometer que em um mês eu vou aumentar teu resultado em 10x, eu estaria sendo um picareta. Isso pode acontecer? Pode! Mas não é algo que posso prometer. Porém, o que eu posso prometer, é que tu vai estar com a empresa que trabalha com Arezzo, Spotify, Melissa, Spoleto e SmartFit cuidando do teu processo de marketing e vendas. O que seria muito bom, certo?`,
    simplificada:`` },
  { id:'obj-7', titulo:'Em quanto tempo geralmente tenho resultado?', momento:'Qualificação', tipo:'Ceticismo',
    completa:`Olha lead, basicamente, não é algo tão exato. Por exemplo, tiveram leads que na segunda semana já tiveram um excelente resultado conosco, e tiveram leads que no terceiro mês tiveram esse resultado excelente, e assim conseguiram escalar! O que, pela nossa experiência, garantimos é que no máximo a partir do terceiro mês, conseguimos entender os principais indicadores e conseguir escalar os resultados a partir disso.`,
    simplificada:`Então, em relação a isso eu não posso te afirmar com exatidão como outros no mercado fariam só para poder te vender, porque meus primeiros passos com você são em relação à coleta de informações. Tiveram clientes que na segunda semana já deram resultado, assim como outros que tiveram resultado só a partir do terceiro mês.` },
  { id:'obj-8', titulo:'Me manda um email com mais informações', momento:'Pré qualificação', tipo:'Concepção errada',
    completa:`Cara, eu poderia até te mandar um email, mas nesse primeiro contato é aonde eu busco entender como está o seu cenário, aquilo que você já tem feito e também tornar conhecido aquilo que já temos feito. Se fizer sentido para ambos e caminhar para uma parceria, ao invés de te mandar uma apresentação como 90% das empresas fazem, eu marco uma reunião de apresentação para você com o meu especialista, aonde ele fará essa apresentação. Entendeu?`,
    simplificada:`Cara, eu poderia até te mandar, mas você acha que conversar sobre como podemos fazer a sua empresa escalar e expandir sua relevância seria um assunto para se tratar por e-mail?` },
  { id:'obj-9', titulo:'Não estou com muito tempo para conversar', momento:'Pré qualificação', tipo:'Concepção errada',
    completa:`Eu entendo que você é super sem tempo, afinal, você é o CEO. Mas eu queria bater um papo em alguns minutos só para entender se geração de demanda e conversão em vendas é uma prioridade para você hoje. Se não for, ótimo, nos despedimos.`,
    simplificada:`Eu entendo, e prometo não tomar muito do seu tempo, mas meu trabalho é aumentar suas vendas através de estratégias de marketing como tenho feito com Arezzo, Spotify e Melissa. Pude notar alguns pontos de melhoria analisando suas redes sociais, podemos conversar alguns minutos?` },
  { id:'obj-10', titulo:'Já tenho time interno de marketing', momento:'Qualificação', tipo:'Concepção errada',
    completa:`Excelente, isso já mostra que você está buscando melhorar seu digital mais ainda! Porém, isso me lembra o exemplo de um de nossos clientes, a Arezzo, que tem um andar inteiro de um prédio com seu time de marketing, mas mesmo assim contratou a V4, pois nós temos a expertise de estar trabalhando com mais de 1.900 empresas, e já ter atuado bem no segmento deles, com o objetivo de ser a empresa que implementaria esse processo de marketing e vendas, para posteriormente o time deles tocarem!`,
    simplificada:`Excelente colocação, porque isso já mostra uma maturidade da sua parte em relação ao digital. Mas quanto a isso, pode ficar despreocupado, pois quando começamos nosso trabalho com a Arezzo ela já possuía um andar inteiro só de funcionários voltados para o marketing, e assim começamos uma parceria, fazendo um trabalho de auditoria, revendo todos os gaps da operação deles com toda a experiência de alguém que gerencia alguns milhões todos os dias em marketing.` },
  { id:'obj-11', titulo:'Vocês não atendem os leads por mim, não fazem as vendas?', momento:'Qualificação', tipo:'Concepção errada',
    completa:`Perfeito lead, o nosso trabalho é a quatro mãos, então nosso papel chave é fazer com que cheguem leads qualificados para o teu time comercial poder vender para eles. Como sabemos que não adianta apenas entregar esses leads sem vendas, também assessoramos teu time comercial, seja com um script para eles, ou no próprio processo, pois eles vão garantir que esse resultado aconteça, fazendo com que o trabalho fique completo de ponta a ponta.`,
    simplificada:`É um trabalho a 4 mãos. Eu sou o responsável por fazer o teu melhor tipo de cliente chegar na tua porta, e ajudo teu time comercial a recebê-lo e a vender para ele. Mas ainda é responsabilidade dele fazer a venda. Faz sentido?` },
  { id:'obj-12', titulo:'Já estou com uma agência (Recovery)', momento:'Recovery', tipo:'Contorno',
    completa:`Que ótimo, fico feliz que você não ficou parado. Me conta — o problema que você tinha antes de [dor] já foi resolvido com eles?\n\nSe não foi: Então talvez valha a pena a gente se falar. Não estou dizendo para trocar — estou dizendo que você pode estar deixando resultado na mesa. 30 minutos para validar isso não custa nada. Faz sentido?`,
    simplificada:`Se foi resolvido: Entendido. E se aparecer um gargalo novo, pode contar comigo.` },
  { id:'obj-13', titulo:'É muito caro / não temos budget agora (Recovery)', momento:'Recovery', tipo:'Contorno',
    completa:`Entendo. Só uma coisa: quando a gente se falou antes, o problema de [dor] estava custando quanto por mês para a empresa em receita não gerada?\n\n(Deixa ele responder. Depois:)\n\nEntão o custo de não resolver pode ser maior que o investimento. Não precisa decidir agora — mas vale a pena a gente se encontrar por 30 minutos para você ter clareza dos números antes de tomar essa decisão. Concorda?`,
    simplificada:`` },
  { id:'obj-14', titulo:'Vamos deixar para depois / não é o momento (Recovery)', momento:'Recovery', tipo:'Contorno',
    completa:`Tudo bem. Só me ajuda a entender: depois é quando? Porque quando você falou "depois" da última vez, [dor] continuou sem solução.\n\nSe ele der uma data vaga: Que tal a gente já trava uma data agora — mesmo que seja daqui 3 semanas — para você não perder o fio da meada? Fica no seu calendário, sem pressão.`,
    simplificada:`` },
]

const CHECKLIST_ITEMS = [
  { fase: 'Pré-Call', itens: ['Pesquisei o Instagram/site da empresa antes de ligar?', 'Tenho pelo menos 1 dado sobre o negócio deles?'] },
  { fase: 'ACE (Abertura)', itens: ['Agradeci o tempo', 'Confirmei os 5 minutos', 'Expliquei o objetivo', 'Peguei o "combinado?"'] },
  { fase: 'S — Situation', itens: ['Entendi o modelo de negócio', 'Entendi como os clientes chegam até eles', 'Descobri se investem em mídia (quanto e onde)', 'Peguei a META de faturamento', 'Peguei o faturamento ATUAL', 'Validei o gap em R$', 'Descobri há quanto tempo estão nesse patamar', 'Descobri se já trabalharam com agência antes'] },
  { fase: 'P — Pain', itens: ['Perguntei o que motivou o contato AGORA', 'Identifiquei o gargalo principal', 'Cavei mais fundo (não aceitei a primeira resposta)', 'Perguntei o que já tentaram para resolver'] },
  { fase: 'Checkpoint', itens: ['Fiz o resumo da situação com os dados reais', 'Validei com o prospect ("É isso ou deixei passar algo?")'] },
  { fase: 'I — Impact', itens: ['Calculei o gap em R$ na frente do prospect', 'Fiz a pergunta de tempo (sem V4 vs. com V4)', 'Perguntei o impacto emocional (rotina, liberdade)', 'Amplifiquei a resposta antes de avançar'] },
  { fase: 'CE — Critical Event', itens: ['Perguntei para quando precisam resolver', 'Perguntei POR QUE essa data', 'Perguntei o que acontece se NÃO resolver', 'Se não tinha urgência: criei via deterioração'] },
  { fase: 'D — Decision', itens: ['Identifiquei quem é o decisor real', 'Confirmei se o decisor vai estar na reunião', 'Se não: peguei o contato do decisor direto', 'Perguntei os critérios de decisão', 'FIZ A PERGUNTA DE PRÉ-COMPROMISSO'] },
  { fase: 'Agendamento', itens: ['Usei a dor dele para personalizar o convite', 'Ofereci 2 opções de horário (nunca 1)', 'Criei escassez de agenda', 'Confirmei 45 min sem interrupções'] },
  { fase: 'Confirmação', itens: ['Mandei o convite durante a ligação', 'Esperei o prospect clicar em "aceitar" ao vivo', 'Criei o grupo no WhatsApp na mesma call', 'Me comprometi a mandar cases relevantes'] },
]

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Objection = { id: string; titulo: string; momento: string; tipo: string; completa: string; simplificada: string }

// ─── Busca inteligente ────────────────────────────────────────────────────────

const normalize = (s: string) =>
  s.toLowerCase()
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()

// Mapa de sinônimos: palavra-chave → termos equivalentes
const SYNONYM_MAP: Record<string, string[]> = {
  'agencia':       ['agência', 'parceiro', 'fornecedor', 'ja tenho', 'tenho agencia', 'contratei'],
  'preco':         ['caro', 'barato', 'valor', 'custo', 'budget', 'dinheiro', 'investimento', 'quanto custa', 'muito caro'],
  'resultado':     ['retorno', 'roi', 'funciona', 'certeza', 'garantia', 'prova', 'certeza de resultado'],
  'tempo':         ['nao tenho tempo', 'ocupado', 'corrido', 'sem tempo', 'rapido'],
  'email':         ['manda email', 'informacoes', 'material', 'apresentacao', 'envia'],
  'offline':       ['presencial', 'fisico', 'loja', 'local', 'regiao'],
  'social':        ['seguidores', 'curtidas', 'instagram', 'likes', 'redes sociais', 'engajamento'],
  'concorrente':   ['outra empresa', 'comparar', 'melhor', 'alternativa', 'market'],
  'pequeno':       ['porte', 'pequena empresa', 'micro', 'nao sou grande'],
  'interno':       ['time interno', 'equipe propria', 'funcionario', 'contratei alguem', 'ja faco'],
  'depois':        ['mais tarde', 'nao e agora', 'proximo mes', 'nao e o momento', 'deixa pra depois'],
  'nao fazem':     ['nao atende leads', 'nao faz venda', 'quem vende sou eu', 'a quatro maos'],
  'tudo':          ['faz tudo', 'servico completo', 'generalista', 'full service'],
  'certeza':       ['como posso ter certeza', 'garantia', 'como saber', 'vai dar resultado'],
  'grande':        ['grande empresa', 'arezzo', 'spotify', 'smart fit', 'so atende grande'],
  'regiao':        ['longe', 'distante', 'particularidade', 'nao conhece minha regiao'],
  'presencial':    ['só trabalho presencial', 'nao gosto de online', 'quero presencial'],
  'recovery':      ['ja falamos', 'proposta enviada', 'nao deu certo', 'retomada'],
}

function expandQuery(raw: string): string[] {
  const n = normalize(raw)
  const words = n.split(' ')
  const expanded = new Set(words)
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    const allTerms = [key, ...synonyms.map(normalize)]
    const hit = allTerms.some(t => n.includes(t))
    if (hit) allTerms.forEach(t => t.split(' ').forEach(w => expanded.add(w)))
  }
  return Array.from(expanded).filter(w => w.length >= 2)
}

function scoreObjection(obj: Objection, terms: string[]): number {
  const fields = [
    { text: normalize(obj.titulo),      w: 12 },
    { text: normalize(obj.tipo),        w: 6  },
    { text: normalize(obj.momento),     w: 4  },
    { text: normalize(obj.completa),    w: 2  },
    { text: normalize(obj.simplificada), w: 1 },
  ]
  let score = 0
  for (const term of terms) {
    for (const { text, w } of fields) {
      if (text.includes(term)) {
        // exact word boundary bonus
        const regex = new RegExp(`\\b${term}\\b`)
        score += regex.test(text) ? w * 4 : w * 2
      }
      // partial prefix match (min 3 chars)
      if (term.length >= 3) {
        for (const word of text.split(' ')) {
          if (word.startsWith(term) && word !== term) score += w
        }
      }
    }
  }
  return score
}

function highlight(text: string, terms: string[]): string {
  let result = text
  for (const term of terms.filter(t => t.length >= 3)) {
    try {
      result = result.replace(new RegExp(`(${term})`, 'gi'), '**$1**')
    } catch {}
  }
  return result
}

function getSnippet(obj: Objection, terms: string[]): string {
  const text = obj.completa || obj.simplificada
  const norm = normalize(text)
  let best = 0
  for (const term of terms) {
    const idx = norm.indexOf(term)
    if (idx >= 0) { best = idx; break }
  }
  const start = Math.max(0, best - 30)
  const raw   = text.slice(start, start + 120).trim()
  return (start > 0 ? '...' : '') + raw + (text.length > start + 120 ? '...' : '')
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: `1px solid ${copied ? GREEN : BORDER}`, background: copied ? `${GREEN}12` : WHITE, color: copied ? GREEN : GRAY2, fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'all .15s' }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

function ScriptBlock({ chave, overrides, onSave, canEdit }: {
  chave: string
  overrides: Record<string, string>
  onSave: (chave: string, valor: string) => Promise<void>
  canEdit: boolean
}) {
  const text = overrides[chave] ?? DEFAULT_SCRIPTS[chave] ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(chave, draft)
    setSaving(false)
    setEditing(false)
  }

  const handleCancel = () => { setDraft(text); setEditing(false) }

  if (editing) {
    return (
      <div style={{ marginTop: 8 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.max(4, draft.split('\n').length + 1)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `2px solid ${R}`, fontSize: 13, color: GRAY1, lineHeight: 1.65, fontFamily: 'inherit', resize: 'vertical', outline: 'none', background: `${R}04` }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Save size={12} />{saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={handleCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <X size={12} />Cancelar
          </button>
          {overrides[chave] && (
            <button onClick={() => { setDraft(DEFAULT_SCRIPTS[chave] ?? ''); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <RotateCcw size={11} />Restaurar padrão
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', group: 1 } as any}>
      <div style={{ background: GRAY4, borderLeft: `3px solid ${R}30`, borderRadius: '0 10px 10px 0', padding: '12px 14px 12px 14px', fontSize: 13, color: GRAY1, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 8 }}>
        {text}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <CopyBtn text={text} />
        {canEdit && (
          <button onClick={() => { setDraft(text); setEditing(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <Pencil size={11} />Editar
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ titulo, objetivo, nota, children, defaultOpen = true }: {
  titulo: string; objetivo?: string; nota?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 12, background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: open ? `${R}12` : GRAY4, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
            {open ? <ChevronDown size={14} color={R} /> : <ChevronRight size={14} color={GRAY3} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: GRAY1 }}>{titulo}</span>
        </div>
        {objetivo && <span style={{ fontSize: 11, color: GRAY3, maxWidth: 340, textAlign: 'right', lineHeight: 1.4 }}>{objetivo}</span>}
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px 18px', borderTop: `1px solid ${GRAY4}` }}>
          {nota && <div style={{ background: `${BLUE}08`, border: `1px solid ${BLUE}20`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: BLUE, fontWeight: 600, marginTop: 12, marginBottom: 4, lineHeight: 1.5 }}>{nota}</div>}
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ScriptsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'inbound' | 'recovery' | 'recomendacao' | 'prospeccao' | 'objections' | 'checklist' | 'complementar'>('inbound')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [objSearch, setObjSearch] = useState('')
  const [objExpanded, setObjExpanded] = useState<string | null>(null)
  const [objEdit, setObjEdit] = useState<string | null>(null)
  const [objDrafts, setObjDrafts] = useState<Record<string, Partial<Objection>>>({})
  const [objections, setObjections] = useState<Objection[]>(DEFAULT_OBJECTIONS)
  const [canEdit, setCanEdit] = useState(false)

  // ── Busca global ──
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchCursor, setSearchCursor] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  const searchResults = useMemo(() => {
    const q = globalSearch.trim()
    if (q.length < 2) return []
    const terms = expandQuery(q)
    return objections
      .map(obj => ({ obj, score: scoreObjection(obj, terms) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map(r => ({ ...r, terms }))
  }, [globalSearch, objections])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      // Load overrides
      const { data } = await supabase.from('playbook_overrides').select('chave, conteudo')
      if (data) {
        const map: Record<string, string> = {}
        data.forEach((r: any) => { map[r.chave] = r.conteudo })
        setOverrides(map)
        // Restore saved objections
        if (map['__objections__']) {
          try { setObjections(JSON.parse(map['__objections__'])) } catch {}
        }
      }
      // Check role
      const { data: u } = await supabase.from('usuarios_permitidos').select('papel').eq('email', session.user.email!).single()
      const papel = u?.papel
      setCanEdit(papel === 'admin' || papel === 'sdr' || papel === 'closer' || session.user.email === 'matheus.nunes@v4company.com')
    })
  }, [])

  // Fechar busca ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const goToResult = (obj: Objection) => {
    setActiveTab('objections')
    setObjExpanded(obj.id)
    setGlobalSearch('')
    setSearchFocused(false)
    setSearchCursor(0)
    setTimeout(() => {
      document.getElementById(`obj-card-${obj.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (!searchResults.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchCursor(c => Math.min(c + 1, searchResults.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSearchCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); goToResult(searchResults[searchCursor]?.obj) }
    if (e.key === 'Escape')    { setSearchFocused(false); setGlobalSearch('') }
  }

  const saveOverride = useCallback(async (chave: string, conteudo: string) => {
    await supabase.from('playbook_overrides').upsert({ chave, conteudo, updated_at: new Date().toISOString() })
    setOverrides(prev => ({ ...prev, [chave]: conteudo }))
  }, [])

  const saveObjections = async (list: Objection[]) => {
    const json = JSON.stringify(list)
    await supabase.from('playbook_overrides').upsert({ chave: '__objections__', conteudo: json, updated_at: new Date().toISOString() })
    setOverrides(prev => ({ ...prev, '__objections__': json }))
    setObjections(list)
  }

  const sb = (chave: string) => (
    <ScriptBlock chave={chave} overrides={overrides} onSave={saveOverride} canEdit={canEdit} />
  )

  const TABS = [
    { id: 'inbound',      label: 'Inbound' },
    { id: 'recovery',     label: 'Recovery' },
    { id: 'recomendacao', label: 'Recomendação' },
    { id: 'prospeccao',   label: 'Prosp. Ativa' },
    { id: 'objections',   label: 'Objeções' },
    { id: 'checklist',    label: 'Checklist' },
    { id: 'complementar', label: 'Script Complementar' },
  ] as const

  const tipoColor: Record<string, string> = {
    'Concepção errada': BLUE,
    'Ceticismo': '#8B5CF6',
    'Real problema': '#F97316',
    'Reclamação real': R,
    'Deal breaker': GRAY2,
    'Contorno': '#0D9488',
  }

  return (
    <CRMLayout title="Scripts & Playbook">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: R, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>Pré-Vendas</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: GRAY1, margin: 0, letterSpacing: '-0.02em' }}>Scripts & Playbook SPICED</h1>
          <p style={{ fontSize: 13, color: GRAY2, marginTop: 6 }}>
            Scripts interativos baseados na metodologia SPICED · Clique em <strong>Copiar</strong> para usar na call · {canEdit && 'Clique em Editar para personalizar'}
          </p>
        </div>

        {/* ── Busca Global de Objeções ── */}
        <div ref={searchBoxRef} style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: searchFocused ? WHITE : '#F9F9F9',
            border: `2px solid ${searchFocused ? R : BORDER}`,
            borderRadius: 14, padding: '10px 16px',
            boxShadow: searchFocused ? `0 0 0 4px ${R}12` : 'none',
            transition: 'all .18s',
          }}>
            <Search size={16} color={searchFocused ? R : GRAY3} style={{ flexShrink: 0, transition: 'color .15s' }} />
            <input
              ref={searchRef}
              placeholder="Buscar objeção... ex: 'já tenho agência', 'muito caro', 'não tenho tempo'"
              value={globalSearch}
              onChange={e => { setGlobalSearch(e.target.value); setSearchCursor(0); setSearchFocused(true) }}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={handleSearchKey}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: GRAY1, background: 'transparent', fontFamily: 'inherit' }}
            />
            {globalSearch && (
              <button onClick={() => { setGlobalSearch(''); setSearchFocused(false); searchRef.current?.focus() }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY3, padding: 2, display: 'flex', alignItems: 'center' }}>
                <X size={14} />
              </button>
            )}
            {!globalSearch && (
              <span style={{ fontSize: 10, color: GRAY3, background: GRAY4, borderRadius: 5, padding: '2px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>objeções</span>
            )}
          </div>

          {/* Dropdown de resultados */}
          {searchFocused && globalSearch.trim().length >= 2 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14,
              boxShadow: '0 12px 40px rgba(0,0,0,.14)', marginTop: 6, overflow: 'hidden',
            }}>
              {searchResults.length === 0 ? (
                <div style={{ padding: '20px 18px', textAlign: 'center', color: GRAY3, fontSize: 13 }}>
                  Nenhuma objeção encontrada. Tente outras palavras.
                </div>
              ) : (
                <>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, color: GRAY3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {searchResults.length} resultado{searchResults.length > 1 ? 's' : ''} — ↑↓ navegar · Enter abrir · Esc fechar
                  </div>
                  {searchResults.map((r, i) => {
                    const tipoColor: Record<string, string> = {
                      'Concepção errada': BLUE, 'Ceticismo': '#8B5CF6', 'Real problema': '#F97316',
                      'Reclamação real': R, 'Deal breaker': GRAY2, 'Contorno': '#0D9488',
                    }
                    const cor = tipoColor[r.obj.tipo] || GRAY2
                    const snippet = getSnippet(r.obj, r.terms)
                    const isActive = searchCursor === i
                    return (
                      <div key={r.obj.id}
                        onMouseEnter={() => setSearchCursor(i)}
                        onClick={() => goToResult(r.obj)}
                        style={{
                          padding: '12px 16px', cursor: 'pointer',
                          background: isActive ? `${R}06` : 'transparent',
                          borderLeft: `3px solid ${isActive ? R : 'transparent'}`,
                          borderBottom: i < searchResults.length - 1 ? `1px solid ${GRAY4}` : 'none',
                          transition: 'all .1s',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: isActive ? R : GRAY1 }}>{r.obj.titulo}</span>
                          <span style={{ padding: '1px 8px', borderRadius: 20, background: `${cor}14`, color: cor, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{r.obj.tipo}</span>
                          {r.obj.momento && <span style={{ fontSize: 10, color: GRAY3 }}>{r.obj.momento}</span>}
                        </div>
                        {snippet && (
                          <div style={{ fontSize: 12, color: GRAY2, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>
                            {snippet}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div style={{ padding: '8px 14px', background: GRAY4, borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: 10, color: GRAY3, fontWeight: 600 }}>💡 Tente: "agência", "caro", "resultado", "tempo", "email", "concorrente"</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${activeTab === t.id ? R : BORDER}`, background: activeTab === t.id ? R : WHITE, color: activeTab === t.id ? WHITE : GRAY1, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── INBOUND ── */}
        {activeTab === 'inbound' && (
          <div>
            <Section titulo="ACE — Abertura" objetivo="Assumir controle, demonstrar respeito pelo tempo e fazer o primeiro acordo">
              {sb('inbound-ace-script')}
            </Section>

            <Section titulo="S — Situation" objetivo="Contexto, faturamento, canais de aquisição, estrutura atual" defaultOpen={false}>
              {['inbound-situation-script-0','inbound-situation-script-1','inbound-situation-script-2'].map(k => (
                <div key={k} style={{ marginBottom: 6 }}>{sb(k)}</div>
              ))}
              <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>Para Faturamento</div>
              {['inbound-situation-script-3','inbound-situation-script-4','inbound-situation-script-5'].map(k => (
                <div key={k} style={{ marginBottom: 6 }}>{sb(k)}</div>
              ))}
            </Section>

            <Section titulo="P — Pain" objetivo="A dor real. Não aceite a primeira resposta — cave mais fundo" defaultOpen={false}>
              {['inbound-pain-script-0','inbound-pain-script-1','inbound-pain-script-2'].map(k => (
                <div key={k} style={{ marginBottom: 6 }}>{sb(k)}</div>
              ))}
            </Section>

            <Section titulo="✓ Checkpoint" objetivo="Confirmar entendimento e elevar sua autoridade" defaultOpen={false}>
              <div style={{ marginBottom: 6 }}>{sb('inbound-checkpoint-script-0')}</div>
              <div style={{ background: `${GREEN}10`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: GREEN, fontWeight: 600, margin: '6px 0' }}>✓ Se "Sim, é isso" → engajamento subiu, avance. Se "Não" → peça para corrigir.</div>
              {sb('inbound-checkpoint-script-1')}
            </Section>

            <Section titulo="I — Impact" objetivo="Transformar a dor em consequência — racional + emocional" defaultOpen={false}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 0 4px' }}>Impacto Racional</div>
              {['inbound-impact-script-0','inbound-impact-script-1'].map(k => (
                <div key={k} style={{ marginBottom: 6 }}>{sb(k)}</div>
              ))}
              <div style={{ fontSize: 11, fontWeight: 700, color: GRAY2, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>Impacto Emocional</div>
              {sb('inbound-impact-script-2')}
            </Section>

            <Section titulo="CE — Critical Event" objetivo="Separar curiosos de compradores — data limite com consequências" defaultOpen={false}>
              {['inbound-ce-script-0','inbound-ce-script-1','inbound-ce-script-2'].map(k => (
                <div key={k} style={{ marginBottom: 6 }}>{sb(k)}</div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <div style={{ background: `${GRAY2}08`, borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: GRAY2, marginBottom: 4 }}>Lead FRIO</div>
                  <div style={{ color: GRAY3 }}>"Nada demais" se não resolver</div>
                </div>
                <div style={{ background: `${R}08`, borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: R, marginBottom: 4 }}>Lead QUENTE</div>
                  <div style={{ color: GRAY2 }}>"Perco dinheiro / faliu / sou demitido"</div>
                </div>
              </div>
            </Section>

            <Section titulo="D — Decision" objetivo="Mapear quem manda, quem influencia, o que importa" defaultOpen={false}>
              {['inbound-decision-script-0','inbound-decision-script-1','inbound-decision-script-2','inbound-decision-script-3'].map(k => (
                <div key={k} style={{ marginBottom: 6 }}>{sb(k)}</div>
              ))}
            </Section>

            <Section titulo="Agendamento" objetivo="Agendar trazendo todos os decisores" defaultOpen={false}>
              {sb('inbound-agendamento-script')}
            </Section>

            <Section titulo="Confirmação" objetivo="Criar compromisso psicológico" defaultOpen={false}>
              {sb('inbound-confirmacao-script')}
            </Section>

            <Section titulo="🔗 Pontes entre Etapas" objetivo="Transições naturais sem mudar de assunto bruscamente" defaultOpen={false}>
              {[
                { key: 'inbound-pontes-sp', label: 'Situação → Problema (S→P)' },
                { key: 'inbound-pontes-pi', label: 'Problema → Impacto (P→I)' },
                { key: 'inbound-pontes-ice', label: 'Impacto → Evento Crítico (I→CE)' },
                { key: 'inbound-pontes-ced', label: 'Evento Crítico → Decisão (CE→D)' },
              ].map(({ key, label }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, marginBottom: 2 }}>{label}</div>
                  {sb(key)}
                </div>
              ))}
            </Section>
          </div>
        )}

        {/* ── RECOVERY ── */}
        {activeTab === 'recovery' && (
          <div>
            <Section titulo="ACE — Abertura" objetivo="Criar permissão. Não vender nada aqui.">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, marginTop: 10 }}>
                {['Versão 1','Versão 2','Versão 3','Versão 4'].map((v, i) => (
                  <span key={i} style={{ padding: '2px 10px', borderRadius: 20, background: `${BLUE}12`, color: BLUE, fontSize: 11, fontWeight: 700 }}>{v}</span>
                ))}
              </div>
              {['recovery-ace-script-0','recovery-ace-script-1','recovery-ace-script-2','recovery-ace-script-3'].map((k, i) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Versão {i + 1}</div>
                  {sb(k)}
                </div>
              ))}
            </Section>

            <Section titulo="S — Situation" objetivo="Atualizar contexto sem basear em dados antigos" defaultOpen={false}>
              {sb('recovery-situation-script')}
            </Section>

            <Section titulo="P, I, CE, D — Qualificação" objetivo="Mesmos scripts do Inbound" defaultOpen={false}>
              <div style={{ background: `${BLUE}08`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: BLUE, fontWeight: 600 }}>
                Usar os mesmos scripts das seções P, I, CE e D do Inbound. Veja a aba Inbound.
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: GRAY1, marginBottom: 8 }}>Pergunta de retomada</div>
                <div style={{ background: GRAY4, borderLeft: `3px solid ${R}30`, borderRadius: '0 10px 10px 0', padding: '12px 14px', fontSize: 13, color: GRAY1, lineHeight: 1.7, marginTop: 4 }}>
                  "O que aconteceu depois da nossa reunião? Resolveram o problema de [dor mapeada anteriormente] ou ainda está em aberto?"
                </div>
              </div>
            </Section>

            <Section titulo="Agendamento Recovery" defaultOpen={false}>
              <div style={{ background: GRAY4, borderLeft: `3px solid ${R}30`, borderRadius: '0 10px 10px 0', padding: '12px 14px', fontSize: 13, color: GRAY1, lineHeight: 1.7, marginTop: 8 }}>
                "Vou ser direto: não quero vender nada agora por telefone. Quero só te mostrar o que mudou na nossa operação e se ainda faz sentido pra vocês.{'\n\n'}São 30 minutos, sem compromisso. O especialista já vai chegar com um diagnóstico do seu cenário.{'\n\n'}Você tem disponibilidade essa semana — quinta ou sexta, de manhã ou de tarde?"
              </div>
              <div style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}20`, borderRadius: 10, padding: '12px 14px', marginTop: 12, fontSize: 12, color: GREEN, fontWeight: 700 }}>
                ⚡ Regra de Ouro: Se o lead atendeu a ligação — ele não esqueceu de você. Use isso. A familiaridade é o seu maior ativo. Não recomece do zero — retome de onde parou.
              </div>
            </Section>
          </div>
        )}

        {/* ── RECOMENDAÇÃO ── */}
        {activeTab === 'recomendacao' && (
          <div>
            <Section titulo="ACE — Abertura" objetivo="Usar a recomendação como âncora de confiança">
              {sb('recomendacao-ace-script')}
            </Section>
            <Section titulo="S — Situation" defaultOpen={false}>
              {sb('recomendacao-situation-script')}
            </Section>
            <Section titulo="P, I, CE, D / Agendamento / Confirmação" defaultOpen={false}>
              <div style={{ background: `${BLUE}08`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: BLUE, fontWeight: 600 }}>
                Usar os mesmos scripts das seções correspondentes do Inbound.
              </div>
            </Section>
          </div>
        )}

        {/* ── PROSPECÇÃO ATIVA ── */}
        {activeTab === 'prospeccao' && (
          <div>
            <Section titulo="ACE — Abertura" objetivo="Usar referência como âncora de autoridade">
              {sb('prospeccao-ace-script')}
            </Section>
            <Section titulo="S — Situation" defaultOpen={false}>
              {sb('prospeccao-situation-script')}
            </Section>
            <Section titulo="P, I, CE, D / Agendamento / Confirmação" defaultOpen={false}>
              <div style={{ background: `${BLUE}08`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: BLUE, fontWeight: 600 }}>
                Usar os mesmos scripts das seções correspondentes do Inbound.
              </div>
            </Section>
          </div>
        )}

        {/* ── OBJEÇÕES ── */}
        {activeTab === 'objections' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
              <input
                placeholder="Buscar objeção..."
                value={objSearch}
                onChange={e => setObjSearch(e.target.value)}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, color: GRAY1, outline: 'none', fontFamily: 'inherit' }}
              />
              {canEdit && (
                <button
                  onClick={() => {
                    const newObj: Objection = { id: `obj-${Date.now()}`, titulo: 'Nova objeção', momento: '', tipo: 'Concepção errada', completa: '', simplificada: '' }
                    const updated = [...objections, newObj]
                    saveObjections(updated)
                    setObjExpanded(newObj.id)
                    setObjEdit(newObj.id)
                    setObjDrafts(p => ({ ...p, [newObj.id]: newObj }))
                  }}
                  style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + Nova Objeção
                </button>
              )}
            </div>

            {/* Tipos ref */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {Object.entries(tipoColor).map(([tipo, cor]) => (
                <span key={tipo} style={{ padding: '3px 10px', borderRadius: 20, background: `${cor}12`, color: cor, fontSize: 11, fontWeight: 700 }}>{tipo}</span>
              ))}
            </div>

            {objections
              .filter(o => !objSearch || o.titulo.toLowerCase().includes(objSearch.toLowerCase()) || o.completa.toLowerCase().includes(objSearch.toLowerCase()))
              .map(obj => {
                const isOpen = objExpanded === obj.id
                const isEditing = objEdit === obj.id
                const draft = objDrafts[obj.id] ?? obj
                const cor = tipoColor[obj.tipo] || GRAY2
                return (
                  <div key={obj.id} id={`obj-card-${obj.id}`} style={{ marginBottom: 8, background: WHITE, borderRadius: 12, border: `1px solid ${isOpen ? cor + '40' : BORDER}`, overflow: 'hidden', transition: 'border-color .15s' }}>
                    <button onClick={() => setObjExpanded(isOpen ? null : obj.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {isOpen ? <ChevronDown size={14} color={cor} /> : <ChevronRight size={14} color={GRAY3} />}
                        <span style={{ fontSize: 13, fontWeight: 800, color: GRAY1, minWidth: 0 }}>{obj.titulo}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {obj.momento && <span style={{ fontSize: 10, color: GRAY3, whiteSpace: 'nowrap' }}>{obj.momento}</span>}
                        <span style={{ padding: '2px 8px', borderRadius: 20, background: `${cor}12`, color: cor, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{obj.tipo}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 16px 16px 16px', borderTop: `1px solid ${GRAY4}` }}>
                        {isEditing ? (
                          <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                              { label: 'Título', field: 'titulo' as keyof Objection },
                              { label: 'Momento', field: 'momento' as keyof Objection },
                              { label: 'Tipo', field: 'tipo' as keyof Objection },
                            ].map(({ label, field }) => (
                              <div key={field}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: GRAY2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                                <input value={draft[field] as string || ''} onChange={e => setObjDrafts(p => ({ ...p, [obj.id]: { ...p[obj.id] ?? obj, [field]: e.target.value } }))}
                                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, color: GRAY1, fontFamily: 'inherit', outline: 'none' }} />
                              </div>
                            ))}
                            {[
                              { label: 'Resposta Completa', field: 'completa' as keyof Objection },
                              { label: 'Resposta Simplificada', field: 'simplificada' as keyof Objection },
                            ].map(({ label, field }) => (
                              <div key={field}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: GRAY2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                                <textarea value={draft[field] as string || ''} onChange={e => setObjDrafts(p => ({ ...p, [obj.id]: { ...p[obj.id] ?? obj, [field]: e.target.value } }))}
                                  rows={4} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, color: GRAY1, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => {
                                const updated = objections.map(o => o.id === obj.id ? { ...o, ...(objDrafts[obj.id] ?? {}) } : o)
                                saveObjections(updated); setObjEdit(null)
                              }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: R, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                <Save size={12} />Salvar
                              </button>
                              <button onClick={() => setObjEdit(null)} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                              <button onClick={() => {
                                if (!confirm('Deletar esta objeção?')) return
                                const updated = objections.filter(o => o.id !== obj.id)
                                saveObjections(updated); setObjExpanded(null)
                              }} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: `1px solid ${R}30`, background: `${R}06`, color: R, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Deletar</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ paddingTop: 12 }}>
                            {obj.completa && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Resposta Completa</div>
                                <div style={{ background: GRAY4, borderLeft: `3px solid ${GREEN}50`, borderRadius: '0 10px 10px 0', padding: '12px 14px', fontSize: 13, color: GRAY1, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{obj.completa}</div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}><CopyBtn text={obj.completa} /></div>
                              </div>
                            )}
                            {obj.simplificada && (
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Resposta Simplificada</div>
                                <div style={{ background: `${BLUE}06`, borderLeft: `3px solid ${BLUE}40`, borderRadius: '0 10px 10px 0', padding: '12px 14px', fontSize: 13, color: GRAY1, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{obj.simplificada}</div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}><CopyBtn text={obj.simplificada} /></div>
                              </div>
                            )}
                            {canEdit && (
                              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={() => { setObjEdit(obj.id); setObjDrafts(p => ({ ...p, [obj.id]: { ...obj } })) }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                  <Pencil size={11} />Editar
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}

        {/* ── CHECKLIST ── */}
        {activeTab === 'checklist' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: GRAY2 }}>
                {Object.values(checklist).filter(Boolean).length} / {CHECKLIST_ITEMS.reduce((s, g) => s + g.itens.length, 0)} itens concluídos
              </div>
              <button onClick={() => setChecklist({})}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, color: GRAY2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <RotateCcw size={12} />Resetar checklist
              </button>
            </div>

            {CHECKLIST_ITEMS.map(grupo => {
              const done = grupo.itens.filter(item => checklist[`${grupo.fase}-${item}`]).length
              const pct = Math.round(done / grupo.itens.length * 100)
              return (
                <div key={grupo.fase} style={{ marginBottom: 10, background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${GRAY4}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: GRAY1 }}>{grupo.fase}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ height: 4, width: 80, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: 4, background: pct === 100 ? GREEN : R, width: `${pct}%`, borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? GREEN : GRAY2 }}>{done}/{grupo.itens.length}</span>
                    </div>
                  </div>
                  <div style={{ padding: '8px 18px 12px' }}>
                    {grupo.itens.map(item => {
                      const key = `${grupo.fase}-${item}`
                      const checked = !!checklist[key]
                      return (
                        <div key={key} onClick={() => setChecklist(p => ({ ...p, [key]: !checked }))}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 4px', cursor: 'pointer', borderRadius: 6, transition: 'background .1s' }}>
                          <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checked ? GREEN : GRAY3}`, background: checked ? GREEN : WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all .15s' }}>
                            {checked && <Check size={11} color={WHITE} strokeWidth={3} />}
                          </div>
                          <span style={{ fontSize: 13, color: checked ? GRAY3 : GRAY1, textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.5 }}>{item}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── SCRIPT COMPLEMENTAR ── */}
        {activeTab === 'complementar' && (
          <div>
            <Section titulo="[A & C] — Abertura e Controle">
              {sb('complementar-ac-script')}
            </Section>
            <Section titulo="[E] — Objetivo e Autoridade" defaultOpen={false}>
              {sb('complementar-e-script')}
            </Section>
            <Section titulo="Takeaway + Pergunta Aberta — início do S do SPICED" defaultOpen={false}>
              {sb('complementar-takeaway-script')}
            </Section>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </CRMLayout>
  )
}
