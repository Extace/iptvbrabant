// Lightweight Nhost client setup (no official CLI). Using CDN for sdk.
// If you later install via npm: import { NhostClient } from '@nhost/nhost-js';
import { NhostClient } from 'https://cdn.jsdelivr.net/npm/@nhost/nhost-js@latest/dist/index.mjs';

// Subdomain & region match nhost/config.yaml
const nhost = new NhostClient({
  subdomain: 'yvkysucfvqxfaqbyeggp',
  region: 'eu-west-2'
});

// Expose globally for app.js usage
window.nhost = nhost;

// Simple helper to insert order
window.saveOrderNhost = async function(order){
  if(!window.nhost){
    return { ok:false, error: 'Nhost client missing' };
  }
  const mutation = `mutation InsertOrder($object: orders_insert_input!) {\n  insert_orders_one(object: $object) { id }\n}`;
  const { data, error } = await window.nhost.graphql.request(mutation, { object: order });
  if(error){
    console.warn('[nhost] order insert error', error);
    return { ok:false, error };
  }
  return { ok:true, id: data?.insert_orders_one?.id };
};
