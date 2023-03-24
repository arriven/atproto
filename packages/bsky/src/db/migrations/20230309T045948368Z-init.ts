import { Kysely, sql } from 'kysely'

// @TODO subject indexes, naming?
// @TODO drop indexes in down()?

export async function up(db: Kysely<unknown>): Promise<void> {
  try {
    // Add trigram support, supporting user search.
    // Explicitly add to public schema, so the extension can be seen in all schemas.
    await sql`create extension if not exists pg_trgm with schema public`.execute(
      db,
    )
  } catch (err: unknown) {
    // The "if not exists" isn't bulletproof against races, and we see test suites racing to
    // create the extension. So we can just ignore errors indicating the extension already exists.
    if (!err?.['detail']?.includes?.('(pg_trgm) already exists')) throw err
  }

  // duplicateRecords
  await db.schema
    .createTable('duplicate_record')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('duplicateOf', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  // assertion
  await db.schema
    .createTable('assertion')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('assertion', 'varchar', (col) => col.notNull())
    .addColumn('subjectDid', 'varchar', (col) => col.notNull())
    .addColumn('subjectDeclarationCid', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('confirmUri', 'varchar')
    .addColumn('confirmCid', 'varchar')
    .addColumn('confirmCreated', 'varchar')
    .addColumn('confirmIndexed', 'varchar')
    .addUniqueConstraint('assertion_unique_subject', [
      'creator',
      'subjectDid',
      'assertion',
    ])
    .execute()

  // profile
  await db.schema
    .createTable('profile')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('displayName', 'varchar', (col) => col.notNull())
    .addColumn('description', 'varchar')
    .addColumn('avatarCid', 'varchar')
    .addColumn('bannerCid', 'varchar')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  // for, eg, profile views
  await db.schema
    .createIndex('profile_creator_idx')
    .on('profile')
    .column('creator')
    .execute()
  await db.schema // Supports user search
    .createIndex(`profile_display_name_tgrm_idx`)
    .on('profile')
    .using('gist')
    .expression(sql`"displayName" gist_trgm_ops`)
    .execute()

  // post
  await db.schema
    .createTable('post')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('text', 'varchar', (col) => col.notNull())
    .addColumn('replyRoot', 'varchar')
    .addColumn('replyRootCid', 'varchar')
    .addColumn('replyParent', 'varchar')
    .addColumn('replyParentCid', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  // for, eg, "postsCount" on profile views
  await db.schema
    .createIndex('post_creator_idx')
    .on('post')
    .column('creator')
    .execute()
  // for, eg, "replyCount" on posts in feed views
  await db.schema
    .createIndex('post_replyparent_idx')
    .on('post')
    .column('replyParent')
    .execute()
  // @TODO keep?
  await db.schema
    .createIndex('post_order_by_idx')
    .on('post')
    .columns(['indexedAt', 'cid'])
    .execute()

  // postEntity
  await db.schema
    .createTable('post_entity')
    .addColumn('postUri', 'varchar', (col) => col.notNull())
    .addColumn('startIndex', 'integer', (col) => col.notNull())
    .addColumn('endIndex', 'integer', (col) => col.notNull())
    .addColumn('type', 'varchar', (col) => col.notNull())
    .addColumn('value', 'varchar', (col) => col.notNull())
    .execute()

  // postEmbedImage
  await db.schema
    .createTable('post_embed_image')
    .addColumn('postUri', 'varchar', (col) => col.notNull())
    .addColumn('position', 'varchar', (col) => col.notNull())
    .addColumn('imageCid', 'varchar', (col) => col.notNull())
    .addColumn('alt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('post_embed_image_pkey', ['postUri', 'position'])
    .execute()

  // postEmbedExternal
  await db.schema
    .createTable('post_embed_external')
    .addColumn('postUri', 'varchar', (col) => col.primaryKey())
    .addColumn('uri', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('description', 'varchar', (col) => col.notNull())
    .addColumn('thumbCid', 'varchar')
    .execute()

  // postEmbedRecord
  await db.schema
    .createTable('post_embed_record')
    .addColumn('postUri', 'varchar', (col) => col.notNull())
    .addColumn('embedUri', 'varchar', (col) => col.notNull())
    .addColumn('embedCid', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('post_embed_record_pkey', ['postUri', 'embedUri'])
    .execute()

  // postHierarchy
  await db.schema
    .createTable('post_hierarchy')
    .addColumn('uri', 'varchar', (col) => col.notNull())
    .addColumn('ancestorUri', 'varchar', (col) => col.notNull())
    .addColumn('depth', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('post_hierarchy_pkey', ['uri', 'ancestorUri'])
    .execute()
  // Supports fetching all children for a post
  await db.schema
    .createIndex('post_hierarchy_ancestoruri_idx')
    .on('post_hierarchy')
    .column('ancestorUri')
    .execute()

  // repost
  await db.schema
    .createTable('repost')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('subjectCid', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addUniqueConstraint('repost_unique_subject', ['creator', 'subject'])
    .execute()
  // for, eg, "repostCount" on posts in feed views
  await db.schema
    .createIndex('repost_subject_idx')
    .on('repost')
    .column('subject')
    .execute()
  // @TODO keep?
  await db.schema
    .createIndex('repost_order_by_idx')
    .on('repost')
    .columns(['indexedAt', 'cid'])
    .execute()

  // follow
  await db.schema
    .createTable('follow')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('subjectDid', 'varchar', (col) => col.notNull())
    .addColumn('subjectDeclarationCid', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addUniqueConstraint('follow_unique_subject', ['creator', 'subjectDid'])
    .execute()
  // for, eg, "followersCount" on profile views
  await db.schema
    .createIndex('follow_subjectdid_idx')
    .on('follow')
    .column('subjectDid')
    .execute()

  // vote
  await db.schema
    .createTable('vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('direction', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('subjectCid', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addUniqueConstraint('vote_unique_subject', ['creator', 'subject'])
    .execute()
  // for, eg, "upvoteCount" on posts in feed views
  await db.schema
    .createIndex('vote_subject_direction_idx')
    .on('vote')
    .columns(['subject', 'direction'])
    .execute()

  // subscription
  await db.schema
    .createTable('subscription')
    .addColumn('service', 'varchar', (col) => col.notNull())
    .addColumn('method', 'varchar', (col) => col.notNull())
    .addColumn('state', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('subscription_pkey', ['service', 'method'])
    .execute()

  // @TODO(bsky) didHandle
  await db.schema
    .createTable('did_handle')
    .addColumn('did', 'varchar', (col) => col.primaryKey())
    .addColumn('handle', 'varchar', (col) => col.unique())
    .addColumn('actorType', 'varchar')
    .addColumn('declarationCid', 'varchar')
    .execute()
  await db.schema
    .createIndex('did_handle_handle_lower_idx')
    .unique()
    .on('did_handle')
    .expression(sql`lower("handle")`) // @TODO needed?
    .execute()
  await db.schema // Supports user search
    .createIndex(`${'did_handle'}_handle_tgrm_idx`)
    .on('did_handle')
    .using('gist')
    .expression(sql`"handle" gist_trgm_ops`)
    .execute()

  // @TODO(bsky) repoRoot
  await db.schema
    .createTable('repo_root')
    .addColumn('did', 'varchar', (col) => col.primaryKey())
    .addColumn('root', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('takedownId', 'integer') // @TODO intentionally missing index
    .execute()

  // @TODO(bsky) record
  await db.schema
    .createTable('record')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('did', 'varchar', (col) => col.notNull())
    .addColumn('collection', 'varchar', (col) => col.notNull())
    .addColumn('rkey', 'varchar', (col) => col.notNull())
    .addColumn('takedownId', 'integer') // @TODO intentionally missing index
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  // @TODO(bsky) ipldBlock
  await db.schema
    .createTable('ipld_block')
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('size', 'integer', (col) => col.notNull())
    .addColumn('content', sql`bytea`, (col) => col.notNull())
    .addPrimaryKeyConstraint('ipld_block_with_creator_pkey', ['creator', 'cid'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // @TODO(bsky) ipldBlock
  await db.schema.dropTable('ipld_block').execute()
  // @TODO(bsky) record
  await db.schema.dropTable('record').execute()
  // @TODO(bsky) repoRoot
  await db.schema.dropTable('repo_root').execute()
  // @TODO(bsky) didHandle
  await db.schema.dropTable('did_handle').execute()
  // subscription
  await db.schema.dropTable('subscription').execute()
  // vote
  await db.schema.dropTable('vote').execute()
  // follow
  await db.schema.dropTable('follow').execute()
  // repost
  await db.schema.dropTable('repost').execute()
  // postHierarchy
  await db.schema.dropTable('post_hierarchy').execute()
  // postEmbedRecord
  await db.schema.dropTable('post_embed_record').execute()
  // postEmbedExternal
  await db.schema.dropTable('post_embed_external').execute()
  // postEmbedImage
  await db.schema.dropTable('post_embed_image').execute()
  // postEntity
  await db.schema.dropTable('post_entity').execute()
  // post
  await db.schema.dropTable('post').execute()
  // profile
  await db.schema.dropTable('profile').execute()
  // assertion
  await db.schema.dropTable('assertion').execute()
  // duplicateRecords
  await db.schema.dropTable('duplicate_record').execute()
}