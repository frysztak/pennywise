package ai

const ReceiptOCRPrompt = `Analyze this receipt and extract data as JSON.

Rules:
1. Merchant name means store name, seller name or business name. It cannot contain the address.
2. Date is the date the receipt was printed. Parse date according to locale, e.g. if receipt is in an European language, date is likely to be in DD.MM.YYYY format.
3. Extract ALL visible line items
4. confidence = image quality / extraction certainty
5. Prices as positive numbers, 2 decimal places
6. "items" array should contain purchased goods. Sub-total or tax-class sums are not goods.
7. Item price is the final price (usually visible on the right side), not per-unit (or per kg) price.
8. Item quantity, unit price or tax rate/class (sometimes denoted as "A", "B" or "C") shouldn't be part of item name.
9. Some items might have a discounted price (sometimes printed right below). Make sure to use discounted price.
10. DO NOT perform any calculations on prices or discounts. Extract data as-is.
`
