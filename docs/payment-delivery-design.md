# Aspire Market Delivery + Protection design

This file documents the product rules for marketplace delivery and payment protection.

- Marketplace item orders and delivery jobs are separate connections and separate payments.
- A seller may list an item as campus pickup only. The buyer can either pick it up personally or post a linked delivery request for another student.
- Delivery requests support three compensation modes: free, fixed amount, or discuss later.
- If money is paid through Aspire, the transaction uses Pay with Aspire, platform service fees, Stripe processing, delayed seller/provider payout, and dispute/refund controls.
- If users choose an off-platform/in-person payment, Aspire does not represent that payment as protected and cannot guarantee recovery or refund.
- Aspire Protected is a platform protection workflow, not legal escrow.
- Marketplace refunds before handoff can be returned through Stripe when eligible. After handoff, refund requests become disputes and payout remains paused while reviewed.
- Delivery-service refunds before pickup can be refunded when eligible. After pickup/service start, disputes require review rather than unilateral instant refunds.
