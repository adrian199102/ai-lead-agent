// Demonstration budget bands in Philippine pesos. Replace with per-workspace
// currency and configurable bands before enabling a public customer channel.
export const BUDGET_RANGES = [
  {value:'Below PHP 5,000',label:'Below ₱5,000'},
  {value:'PHP 5,000–14,999',label:'₱5,000–₱14,999'},
  {value:'PHP 15,000–29,999',label:'₱15,000–₱29,999'},
  {value:'PHP 30,000–49,999',label:'₱30,000–₱49,999'},
  {value:'PHP 50,000–99,999',label:'₱50,000–₱99,999'},
  {value:'PHP 100,000 or more',label:'₱100,000 or more'},
  {value:'Not sure yet',label:'Not sure yet'}
] as const
