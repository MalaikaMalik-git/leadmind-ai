import { redirect } from 'next/navigation';

// The root URL is only an entry point — always send visitors to the login page.
export default function RootPage() {
  redirect('/login');
}
