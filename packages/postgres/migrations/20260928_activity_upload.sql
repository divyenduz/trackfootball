-- Apply before deploying FIT/GPX uploads. Additive: historical rows stay intact.
ALTER TYPE public."PostType" ADD VALUE IF NOT EXISTS 'UPLOADED_ACTIVITY';
