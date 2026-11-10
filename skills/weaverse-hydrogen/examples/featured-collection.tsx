// app/sections/featured-collection/index.tsx
// A Weaverse section with server-side data fetching via loader.

import { gql } from "@shopify/hydrogen";
import type {
	WeaverseComponentLoaderArgs,
	WeaverseComponentProps,
} from "@weaverse/hydrogen/react-router";
import { createSchema } from "@weaverse/hydrogen/react-router";
import type { Ref } from "react";
// Hydrogen 2026.10 removed Image and Money; Pilot ports them as local components.
import { Image } from "~/components/image";
import { Money } from "~/components/money";
import { CACHE_DEFAULT } from "~/utils/cache";
import { unwrapStorefront } from "~/utils/storefront";

// --- Data Types ---

type FeaturedCollectionData = {
	collection: { handle: string };
	productsCount: number;
	showPrice: boolean;
};

// --- GraphQL Query ---

// A gql() document: result types are inferred by @shopify/hydrogen/ts-plugin
// and `npm run typecheck` validates it (no codegen). $country/$language are
// filled from the request by the Storefront client.
const COLLECTION_QUERY = gql(`
  query FeaturedCollection(
    $handle: String!
    $first: Int!
    $language: LanguageCode
    $country: CountryCode
  ) @inContext(language: $language, country: $country) {
    collection(handle: $handle) {
      id
      title
      handle
      products(first: $first, sortKey: BEST_SELLING) {
        nodes {
          id
          title
          handle
          featuredImage {
            url
            altText
            width
            height
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`);

// --- Loader ---

export const loader = async ({
	weaverse,
	data,
}: WeaverseComponentLoaderArgs<FeaturedCollectionData>) => {
	const { storefront } = weaverse;
	const handle = data?.collection?.handle;

	if (!handle) return null;

	// graphql() returns { data, errors } and has no default cache:
	// pass one explicitly and unwrap to throw on GraphQL errors.
	return unwrapStorefront(
		await storefront.graphql(COLLECTION_QUERY, {
			variables: { handle, first: data.productsCount ?? 8 },
			cache: CACHE_DEFAULT,
		}),
	);
};

// --- Component ---

type Props = WeaverseComponentProps<Awaited<ReturnType<typeof loader>>> &
	FeaturedCollectionData & { ref?: Ref<HTMLElement> };

function FeaturedCollection(props: Props) {
	// React 19: `ref` is a regular prop, no forwardRef needed
	const { ref, loaderData, showPrice, children, ...rest } = props;
	const collection = loaderData?.collection;
	const products = collection?.products?.nodes ?? [];

	return (
		<section ref={ref} {...rest} className="py-16 px-4">
			{/* Children renders any heading/subheading child components */}
			{children}

			{!collection && (
				<p className="text-center text-gray-500">
					Select a collection in Weaverse Studio
				</p>
			)}

			{products.length > 0 && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 max-w-7xl mx-auto">
					{products.map((product) => (
						<a
							key={product.id}
							href={`/products/${product.handle}`}
							className="group block"
						>
							{product.featuredImage && (
								<div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
									<Image
										data={product.featuredImage}
										aspectRatio="1/1"
										sizes="(min-width: 45em) 20vw, 50vw"
										className="w-full h-full object-cover transition-transform group-hover:scale-105"
									/>
								</div>
							)}
							<h3 className="mt-3 font-medium text-gray-900">
								{product.title}
							</h3>
							{showPrice && product.priceRange?.minVariantPrice && (
								<Money
									data={product.priceRange.minVariantPrice}
									className="mt-1 text-sm text-gray-600"
								/>
							)}
						</a>
					))}
				</div>
			)}
		</section>
	);
}

export default FeaturedCollection;

// --- Schema ---

export const schema = createSchema({
	type: "featured-collection",
	title: "Featured Collection",
	settings: [
		{
			group: "Content",
			inputs: [
				{
					type: "collection",
					name: "collection",
					label: "Collection",
					shouldRevalidate: true, // Re-fetch when merchant changes collection
				},
				{
					type: "range",
					name: "productsCount",
					label: "Products to show",
					configs: { min: 2, max: 12, step: 1 },
					defaultValue: 8,
					shouldRevalidate: true,
				},
				{
					type: "switch",
					name: "showPrice",
					label: "Show price",
					defaultValue: true,
				},
			],
		},
	],
	childTypes: ["heading", "subheading"],
	presets: {
		productsCount: 8,
		showPrice: true,
		children: [{ type: "heading", content: "Featured Collection" }],
	},
});
