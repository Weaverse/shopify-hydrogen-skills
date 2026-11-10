// app/weaverse/components.ts
// Component registry — ALL Weaverse sections must be registered here.
//
// Rules:
// 1. ALWAYS use namespace imports: import * as X from '~/sections/x'
// 2. NEVER use default imports: import X from '~/sections/x'  ← WRONG
// 3. Add new components to the array after creating them
// 4. Restart dev server after adding new components

import type { WeaverseComponent } from "@weaverse/hydrogen/react-router";
import * as BlogPosts from "~/sections/blog-posts";
import * as CollectionBanner from "~/sections/collection-banner";
import * as ContactForm from "~/sections/contact-form";
import * as FeaturedCollection from "~/sections/featured-collection";
// Sections (parent components with full page-width layouts)
import * as HeroBanner from "~/sections/hero-banner";
import * as ImageWithText from "~/sections/image-with-text";
import * as Newsletter from "~/sections/newsletter";
import * as ProductCard from "~/sections/product-card";
import * as ProductInformation from "~/sections/product-information";
import * as RelatedProducts from "~/sections/related-products";
import * as RichText from "~/sections/rich-text";
import * as ButtonComponent from "~/sections/shared/button";

// Child components (used inside sections via childTypes)
import * as Heading from "~/sections/shared/heading";
import * as ImageComponent from "~/sections/shared/image";
import * as Paragraph from "~/sections/shared/paragraph";
import * as SubHeading from "~/sections/shared/sub-heading";
import * as Testimonials from "~/sections/testimonials";
import * as VideoSection from "~/sections/video";

export const components: WeaverseComponent[] = [
	// Sections
	HeroBanner,
	FeaturedCollection,
	ImageWithText,
	Testimonials,
	Newsletter,
	RichText,
	VideoSection,
	CollectionBanner,
	ProductInformation,
	RelatedProducts,
	BlogPosts,
	ContactForm,

	// Shared child components
	Heading,
	SubHeading,
	Paragraph,
	ButtonComponent,
	ImageComponent,
	ProductCard,
];
