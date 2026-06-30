export const META_CAPI_EVENTS = [
  { value: 'Lead',                  label: 'Lead — primeiro contato qualificado' },
  { value: 'Contact',               label: 'Contact — entrou em contato' },
  { value: 'ViewContent',           label: 'ViewContent — demonstrou interesse' },
  { value: 'AddToCart',             label: 'AddToCart — adicionou ao carrinho' },
  { value: 'AddPaymentInfo',        label: 'AddPaymentInfo — informou pagamento' },
  { value: 'InitiateCheckout',      label: 'InitiateCheckout — iniciou compra' },
  { value: 'CompleteRegistration',  label: 'CompleteRegistration — se cadastrou' },
  { value: 'Purchase',              label: 'Purchase — venda confirmada' },
  { value: 'Schedule',              label: 'Schedule — agendou' },
  { value: 'StartTrial',            label: 'StartTrial — iniciou teste' },
  { value: 'SubmitApplication',     label: 'SubmitApplication — enviou proposta' },
  { value: 'Subscribe',             label: 'Subscribe — assinou' },
] as const;

export type MetaCapiEventName =
  typeof META_CAPI_EVENTS[number]['value'];
