export const SUPPORTED_CURRENCIES = [
 {code:'USD',label:'US Dollar (USD)'},{code:'EUR',label:'Euro (EUR)'},{code:'GBP',label:'British Pound (GBP)'},
 {code:'PHP',label:'Philippine Peso (PHP)'},{code:'SGD',label:'Singapore Dollar (SGD)'},
 {code:'AUD',label:'Australian Dollar (AUD)'},{code:'CAD',label:'Canadian Dollar (CAD)'},
 {code:'JPY',label:'Japanese Yen (JPY)'},{code:'INR',label:'Indian Rupee (INR)'}
] as const
export type CurrencyCode=typeof SUPPORTED_CURRENCIES[number]['code']
export function budgetRanges(currencyCode:string='USD'){
 const code=SUPPORTED_CURRENCIES.some(c=>c.code===currencyCode)?currencyCode:'USD'
 const format=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:code,maximumFractionDigits:0}).format(n)
 const bands:[[number,number]|null,string][]=[
  [null,'Not sure yet'],[[0,4999],'below'],[[5000,14999],'range'],[[15000,29999],'range'],
  [[30000,49999],'range'],[[50000,99999],'range'],[[100000,Infinity],'above']
 ]
 return bands.map(([range,kind])=>{
  if(!range)return {value:'Not sure yet',label:'Not sure yet'}
  const label=kind==='below'?'Below '+format(5000):kind==='above'?format(100000)+' or more':format(range[0])+'–'+format(range[1])
  return {value:code+' '+label,label}
 })
}
