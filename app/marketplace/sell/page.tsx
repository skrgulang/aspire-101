import { redirect } from 'next/navigation';

export default function MarketplaceSellRedirect() {
  redirect('/post?mode=sell');
}
