// Copyright 2024 the JSR authors. All rights reserved. MIT license.
import { JSX } from "preact";
import { computed, Signal, useSignal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import {
  components,
  create,
  insertMultiple,
  type Orama,
  search,
} from "@orama/orama";
import { api, path } from "../../../utils/api.ts";
import { useMacLike } from "../../../utils/os.ts";

export interface LocalSymbolSearchProps {
  scope: string;
  pkg: string;
  version: string;
  content?: string;
}

export function LocalSymbolSearch(
  props: LocalSymbolSearchProps,
) {
  // deno-lint-ignore no-explicit-any
  const db = useSignal<undefined | Orama<any>>(undefined);
  const selectionIdx = useSignal(-1);
  const parsedSearchContent = useSignal<Document | null>(null);
  const macLike = useMacLike();
  const searchCounter = useSignal(0);

  useEffect(() => {
    (async () => {
      const [oramaDb, searchResp] = await Promise.all([
        (async () => {
          const tokenizer = await components.tokenizer.createTokenizer();

          return create({
            schema: {
              name: "string",
            },
            components: {
              tokenizer: {
                language: "english",
                normalizationCache: new Map(),
                tokenize(
                  raw: string,
                  lang: string | undefined,
                  prop: string | undefined,
                ) {
                  if (prop === "name") {
                    return raw.split(/(?=[A-Z])/).map((s) => s.toLowerCase());
                  }
                  return tokenizer.tokenize(raw, lang, prop);
                },
              },
            },
          });
        })(),
        !props.content ? api.get<string>(
          path`/scopes/${props.scope}/packages/${props.pkg}/versions/${
            props.version || "latest"
          }/docs/search`,
        ) : undefined,
      ]);

      let searchContent;
      if (searchResp) {
        if (searchResp.ok) {
          searchContent = searchResp.data;
        } else {
          console.error(searchResp);
          return;
        }
      } else {
        searchContent = props.content;
      }

      const parser = new DOMParser();
      const searchDocument = parser.parseFromString(searchContent, "text/html");
      parsedSearchContent.value = searchDocument;

      const searchItems = [];
      for (const searchItem of searchDocument.getElementsByClassName("namespaceItem")) {
        searchItems.push({
          name: searchItem.dataset.name,
        });
      }

      await insertMultiple(oramaDb, searchItems);
      db.value = oramaDb;
    })();
  }, []);
  const showResults = useSignal(false);

  useEffect(() => {
    const keyboardHandler = (e: KeyboardEvent) => {
      if (((e.metaKey || e.ctrlKey) && e.key === "/")) {
        e.preventDefault();
        (document.querySelector("#symbol-search-input") as HTMLInputElement)
          ?.focus();
      }
    };
    globalThis.addEventListener("keydown", keyboardHandler);
    return function cleanup() {
      globalThis.removeEventListener("keydown", keyboardHandler);
    };
  });

  async function onInput(e: JSX.TargetedEvent<HTMLInputElement>) {
    if (e.currentTarget.value) {
      const searchResult = await search(db.value!, {
        term: e.currentTarget.value,
        properties: ["name"],
        threshold: 0.4,
      });
      selectionIdx.value = -1;

      let results: string[] = searchResult.hits.map((hit) => hit.document.name);

      const doc = parsedSearchContent.value;
      for (const entrypoints of doc.getElementsByClassName("section")) {
        const items = entrypoints.getElementsByClassName("namespaceItem");

        let hiddenItems = 0;
        for (const searchItem of entrypoints.getElementsByClassName("namespaceItem")) {
          if (results.includes(searchItem.dataset.name)) {
            searchItem.style.removeProperty("display");
          } else {
            hiddenItems++;
            searchItem.style.setProperty("display", "none");
          }
        }

        if (hiddenItems == items.length) {
          entrypoints.style.setProperty("display", "none");
        } else {
          entrypoints.style.removeProperty("display");
        }
      }
      parsedSearchContent.value = doc;
      searchCounter.value++;
      showResults.value = true;
    } else {
      showResults.value = false;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    /*if (e.key === "ArrowDown") {
      selectionIdx.value = Math.min(
        results.value.length - 1,
        selectionIdx.value + 1,
      );
    } else if (e.key === "ArrowUp") {
      selectionIdx.value = Math.max(0, selectionIdx.value - 1);
    } else if (e.key === "Enter") {
      if (selectionIdx.value > -1) {
        if (item !== undefined) {
          e.preventDefault();
          location.href = `/@${props.scope}/${props.pkg}${
            props.version ? `@${props.version}` : ""
          }/doc${item.file === "." ? "" : item.file}/~/${item.name}`;
        }
      }
    }*/
  }

  if (IS_BROWSER) {
    if (showResults.value) {
      const value = parsedSearchContent.value?.documentElement?.innerHTML ?? props.content;

      if (value) {
        document.getElementById("docMain").classList.add("hidden");
        document.getElementById("docSearchResults").classList.remove("hidden");
        document.getElementById("docSearchResults").innerHTML = parsedSearchContent.value?.documentElement?.innerHTML ?? props.content;
      } else {
        document.getElementById("docMain").classList.remove("hidden");
        document.getElementById("docSearchResults").classList.add("hidden");
      }
    } else {
      document.getElementById("docMain").classList.remove("hidden");
      document.getElementById("docSearchResults").classList.add("hidden");
    }
  }

  const placeholder = `Search for symbols in @${props.scope}/${props.pkg}${
    macLike !== undefined ? ` (${macLike ? "⌘/" : "Ctrl+/"})` : ""
  }`;
  return (
    <div class="flex-none" name={searchCounter.value}>
      <input
        type="text"
        placeholder={placeholder}
        id="symbol-search-input"
        class="block text-sm w-full py-1.5 px-2 input-container input bg-white border-1.5 border-jsr-cyan-900/30"
        disabled={!db}
        onInput={onInput}
        onKeyUp={onKeyUp}
      />
    </div>
  );
}
