import { ClientRoot } from '@/app/ClientRoot';

export default function Home() {
  // Swap this import to mount a different UI experiment:
  // import { ChatView } from '@/ui/experiment-a/ChatView'
  return <ClientRoot />;
}
