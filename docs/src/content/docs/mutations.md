---
title: Mutations
description: Write data with useMutation — loading, error, and optimistic update state included.
sidebar:
  order: 2
---

Mutations are server functions called in response to user actions — form submissions, button clicks, drag-and-drop reorders. Alab's `useMutation` hook wraps a server function and tracks its loading, error, and return value state.

## Defining a mutation

```ts
// app/posts/page.server.ts
import { defineServerFn } from "alab/server";
import { z } from "zod";
import { db } from "../../db";

const CreatePostInput = z.object({
  title: z.string().min(1),
  body: z.string().min(10),
});

export const createPost = defineServerFn(async (input) => {
  const { title, body } = CreatePostInput.parse(input);
  return db.posts.create({ data: { title, body } });
});
```

## Calling a mutation

```tsx
// app/posts/page.tsx
import { useMutation } from "alab/client";
import { createPost } from "./page.server";

export default function NewPostForm() {
  const { mutate, isPending, error, data, reset } = useMutation(createPost);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await mutate({
      title: form.get("title") as string,
      body: form.get("body") as string,
    });
  };

  if (data) {
    return <p>Post "{data.title}" created! <button onClick={reset}>Create another</button></p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Title" required />
      <textarea name="body" placeholder="Body" required />
      {error && <p className="error">{error.message}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create post"}
      </button>
    </form>
  );
}
```

## Return values

| Property | Type | Description |
|---|---|---|
| `mutate` | `(input) => Promise<T>` | Call the server function |
| `data` | `T \| null` | Last successful return value |
| `isPending` | `boolean` | `true` while the request is in-flight |
| `error` | `Error \| null` | Last error (cleared on next call) |
| `reset` | `() => void` | Clear `data` and `error` |

## Validation errors

If the server function uses Zod (or any library that throws), the error is surfaced in `error`:

```tsx
const { mutate, error } = useMutation(createPost);

// error.message: "title: String must contain at least 1 character(s)"
```

For field-level validation, return errors from the server function instead of throwing:

```ts
export const createPost = defineServerFn(async (input) => {
  const result = CreatePostInput.safeParse(input);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }
  const post = await db.posts.create({ data: result.data });
  return { post };
});
```

```tsx
const { mutate, data } = useMutation(createPost);

const errors = data?.errors;
// { title: ["Required"], body: ["Too short"] }
```

## Optimistic updates

For instant UI feedback, update local state optimistically before the mutation resolves:

```tsx
import { useMutation } from "alab/client";
import { signal, useSignalValue } from "alab/signals";
import { toggleLike } from "./page.server";

const liked = signal(false);
const likeCount = signal(42);

export function LikeButton({ postId }: { postId: string }) {
  const { mutate, isPending } = useMutation(toggleLike);
  const isLiked = useSignalValue(liked);
  const count = useSignalValue(likeCount);

  const handleClick = async () => {
    // Optimistic update
    liked.set(!isLiked);
    likeCount.update((n) => n + (isLiked ? -1 : 1));

    try {
      await mutate({ postId, liked: !isLiked });
    } catch {
      // Revert on failure
      liked.set(isLiked);
      likeCount.update((n) => n + (isLiked ? 1 : -1));
    }
  };

  return (
    <button onClick={handleClick} disabled={isPending}>
      {isLiked ? "♥" : "♡"} {count}
    </button>
  );
}
```

## Offline support

When the user is offline, `mutate` still resolves — but with `{ __queued: true, id }`. The mutation is stored in IndexedDB and replayed when connectivity returns.

```tsx
const result = await mutate({ title: "Draft" });
if ("__queued" in result && result.__queued) {
  showToast("Saved offline — will sync when connected.");
}
```

See [Offline & Sync](/reference/offline) for full documentation.

## Form actions (progressive enhancement)

For forms that should work without JavaScript, use `mutate` inside a server-enhanced form:

```tsx
<form
  onSubmit={async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await mutate(data);
  }}
  action="/_alab/fn/createPost"
  method="POST"
>
  <input name="title" />
  <button>Submit</button>
</form>
```

The `action` / `method` attributes make the form submit normally without JS — useful for accessibility and environments where JavaScript fails to load.
