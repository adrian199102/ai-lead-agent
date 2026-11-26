import { WebsiteChat } from '@/components/website-chat'
import { notFound } from 'next/navigation'
export default async function ChatPage({params}:{params:Promise<{widgetId:string}>}){
 const {widgetId}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(widgetId))notFound()
 return <main className="mx-auto max-w-xl p-4"><WebsiteChat widgetId={widgetId}/></main>
}
