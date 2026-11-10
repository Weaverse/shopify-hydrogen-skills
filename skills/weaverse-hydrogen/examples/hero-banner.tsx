// app/sections/hero-banner/index.tsx
// A complete Weaverse section with schema, settings groups, childTypes, and presets.

import type {
	WeaverseComponentProps,
	WeaverseImage,
} from "@weaverse/hydrogen/react-router";
import { createSchema } from "@weaverse/hydrogen/react-router";
import type { Ref } from "react";

interface HeroBannerProps extends WeaverseComponentProps {
	heading: string;
	description: string;
	buttonText: string;
	buttonLink: string;
	// `image` inputs return a WeaverseImage (or a URL string as a default value)
	backgroundImage?: WeaverseImage | string;
	overlayOpacity: number;
	contentAlignment: "left" | "center" | "right";
	minHeight: number;
	// React 19: `ref` is a regular prop, no forwardRef needed
	ref?: Ref<HTMLElement>;
}

function HeroBanner(props: HeroBannerProps) {
	const {
		ref,
		heading,
		description,
		buttonText,
		buttonLink,
		backgroundImage,
		overlayOpacity,
		contentAlignment,
		minHeight,
		children,
		...rest
	} = props;

	const backgroundUrl =
		typeof backgroundImage === "string" ? backgroundImage : backgroundImage?.url;

	const alignClass = {
		left: "text-left items-start",
		center: "text-center items-center",
		right: "text-right items-end",
	}[contentAlignment];

	return (
		<section
			ref={ref}
			{...rest}
			className="relative flex items-center justify-center bg-cover bg-center"
			style={{
				backgroundImage: backgroundUrl
					? `url(${backgroundUrl})`
					: undefined,
				minHeight: `${minHeight}px`,
			}}
		>
			{/* Overlay */}
			<div
				className="absolute inset-0 bg-black"
				style={{ opacity: overlayOpacity / 100 }}
			/>

			{/* Content */}
			<div
				className={`relative z-10 flex flex-col ${alignClass} max-w-4xl mx-auto px-4`}
			>
				{heading && (
					<h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
						{heading}
					</h1>
				)}
				{description && (
					<p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl">
						{description}
					</p>
				)}
				{buttonText && buttonLink && (
					<a
						href={buttonLink}
						className="inline-block bg-white text-black px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
					>
						{buttonText}
					</a>
				)}
				{children}
			</div>
		</section>
	);
}

export default HeroBanner;

export const schema = createSchema({
	type: "hero-banner",
	title: "Hero Banner",
	settings: [
		{
			group: "Content",
			inputs: [
				{
					type: "text",
					name: "heading",
					label: "Heading",
					defaultValue: "Welcome to Our Store",
					placeholder: "Enter heading text",
				},
				{
					type: "textarea",
					name: "description",
					label: "Description",
					defaultValue: "Discover amazing products and exceptional service.",
					placeholder: "Enter description text",
				},
				{
					type: "text",
					name: "buttonText",
					label: "Button Text",
					defaultValue: "Shop Now",
				},
				{
					type: "url",
					name: "buttonLink",
					label: "Button Link",
					defaultValue: "/collections/all",
				},
			],
		},
		{
			group: "Design",
			inputs: [
				{
					type: "image",
					name: "backgroundImage",
					label: "Background Image",
				},
				{
					type: "range",
					name: "overlayOpacity",
					label: "Overlay Opacity",
					configs: { min: 0, max: 100, step: 5, unit: "%" },
					defaultValue: 40,
				},
				{
					type: "range",
					name: "minHeight",
					label: "Minimum Height",
					configs: { min: 300, max: 800, step: 50, unit: "px" },
					defaultValue: 500,
				},
				{
					type: "toggle-group",
					name: "contentAlignment",
					label: "Content Alignment",
					configs: {
						options: [
							{ value: "left", label: "Left" },
							{ value: "center", label: "Center" },
							{ value: "right", label: "Right" },
						],
					},
					defaultValue: "center",
				},
			],
		},
	],
	childTypes: ["subheading", "paragraph", "button"],
	presets: {
		heading: "Welcome to Our Store",
		description: "Discover amazing products and exceptional service.",
		buttonText: "Shop Now",
		buttonLink: "/collections/all",
		overlayOpacity: 40,
		minHeight: 500,
		contentAlignment: "center",
		children: [{ type: "subheading", content: "Limited Time Offer" }],
	},
});
