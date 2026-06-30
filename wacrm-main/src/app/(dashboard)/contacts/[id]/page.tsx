'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ContactDetailContent } from '@/components/contacts/contact-detail-view'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ id: string }>
}

export default function ContactDetailPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-in fade-in-50 duration-200">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      <ContactDetailContent
        contactId={id}
        onUpdated={() => {}}
      />
    </div>
  )
}
