# Back-of-the-envelope estimate

These numbers describe a first useful version, not a promise.

- 100,000 registered users
- 10,000 daily active users
- 10,000 open jobs
- 5,000 applications per day
- 50,000 searches per day
- 20,000 match results per day

Assume 220,000 API requests per day. `220,000 / 86,400` is about **2.5 requests/second average**. A 10x daytime peak is about **25 requests/second**, which is easy to handle with a few API instances and workers.

Storage assumptions:

- One application row plus history averages 2 KB: `5,000 * 365 * 2 KB` is about **3.6 GB/year**.
- 20,000 users with a 5 MB resume average is about **100 GB** in Supabase Storage.
- 10,000 notifications/day at 250 bytes is about **0.9 GB/year** before cleanup.

Search and match data are derived and can be rebuilt. If traffic becomes much larger, add read replicas, more workers, and partition old history tables.

