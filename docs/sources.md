# Technical references

The architecture, workload assumptions, SLOs and product decisions are this submission's proposals. The following primary documentation was checked on 2026-09-14 for the underlying mechanism semantics; versions should be pinned and compatibility tested when implementing.

- [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html): row-lock conflicts used to serialize job close against apply.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html): concurrency behavior and why a preliminary uniqueness query is insufficient.
- [RabbitMQ quorum queues](https://www.rabbitmq.com/docs/quorum-queues): replicated durable queue behavior and confirmation boundary.
- [RabbitMQ reliability](https://www.rabbitmq.com/docs/reliability): recovery and delivery considerations.
- [OpenSearch index document API](https://docs.opensearch.org/latest/api-reference/document-apis/index-document/): external aggregate-version checks for projection updates.
- [OpenSearch reindex API](https://docs.opensearch.org/latest/api-reference/document-apis/reindex/): version-aware index migration mechanism; the submission adds a DB snapshot/change-capture cutover procedure.

Excalidraw MCP `read_me` supplied the element format and interactive scene API. Exact scene inputs and returned checkpoints are retained under [diagrams/mcp](../diagrams/mcp). No source is treated as proof of this design's unmeasured throughput or recovery targets.
