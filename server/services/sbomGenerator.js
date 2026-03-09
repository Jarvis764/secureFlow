/**
 * @fileoverview SBOM (Software Bill of Materials) generator service.
 *
 * Supports two standard formats:
 *   - SPDX 2.3 JSON  (generateSPDX)
 *   - CycloneDX 1.5  JSON or XML  (generateCycloneDX)
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function npmRegistryUrl(name) {
  const encodedName = name.startsWith('@')
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);
  return `https://registry.npmjs.org/${encodedName}`;
}

function purl(name, version) {
  const encodedName = name.startsWith('@')
    ? `pkg:npm/%40${encodeURIComponent(name.slice(1))}@${encodeURIComponent(version)}`
    : `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
  return encodedName;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function spdxSafeId(name, version, idx) {
  const base = `SPDXRef-${(name + '-' + version).replace(/[^a-zA-Z0-9.-]/g, '-')}`;
  return idx !== undefined ? `${base}-${idx}` : base;
}

// ---------------------------------------------------------------------------
// SPDX 2.3 JSON generator
// ---------------------------------------------------------------------------

/**
 * Generate an SPDX 2.3 JSON SBOM document.
 *
 * Complies with NTIA minimum elements:
 *   - Supplier name (NOASSERTION when unknown)
 *   - Component name + version
 *   - Unique identifier (SPDXID / purl)
 *   - Dependency relationships
 *   - Author of SBOM data (SecureFlow-SCA)
 *   - Timestamp
 *
 * @param {object} scan - Mongoose Scan document (lean).
 * @param {Array}  dependencies - Array of Dependency documents (lean).
 * @returns {object} SPDX 2.3 JSON document as a plain JS object.
 */
export function generateSPDX(scan, dependencies) {
  const now = new Date().toISOString();
  const uuid = randomUUID();
  const projectName = scan.projectName ?? 'unknown-project';
  const docNamespace = `https://secureflow.dev/sbom/spdx/${encodeURIComponent(projectName)}-${uuid}`;

  const packages = dependencies.map((dep, idx) => {
    const license = dep.license || 'NOASSERTION';
    const supplier = 'NOASSERTION';

    const pkg = {
      SPDXID: spdxSafeId(dep.name, dep.version, idx),
      name: dep.name,
      versionInfo: dep.version,
      downloadLocation: npmRegistryUrl(dep.name),
      supplier,
      filesAnalyzed: false,
      licenseConcluded: license,
      licenseDeclared: license,
      copyrightText: 'NOASSERTION',
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: purl(dep.name, dep.version),
        },
      ],
    };

    return pkg;
  });

  // Build a map from name@version -> SPDXID for relationship building
  const idMap = new Map();
  dependencies.forEach((dep, idx) => {
    idMap.set(`${dep.name}@${dep.version}`, spdxSafeId(dep.name, dep.version, idx));
  });

  // Root "describes" package
  const rootSpdxId = 'SPDXRef-DOCUMENT';
  const relationships = [
    {
      spdxElementId: rootSpdxId,
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: `SPDXRef-${encodeURIComponent(projectName).replace(/[^a-zA-Z0-9.-]/g, '-')}`,
    },
  ];

  // Dependency relationships using parent field
  for (const dep of dependencies) {
    const depId = idMap.get(`${dep.name}@${dep.version}`);
    if (dep.parent) {
      // The parent field stores the parent package name; find the first matching dep
      const parentDep = dependencies.find((d) => d.name === dep.parent);
      if (parentDep) {
        const parentId = idMap.get(`${parentDep.name}@${parentDep.version}`);
        if (parentId) {
          relationships.push({
            spdxElementId: parentId,
            relationshipType: 'DEPENDS_ON',
            relatedSpdxElement: depId,
          });
        }
      }
    }
  }

  // Add project describe package
  const projectPkg = {
    SPDXID: `SPDXRef-${encodeURIComponent(projectName).replace(/[^a-zA-Z0-9.-]/g, '-')}`,
    name: projectName,
    versionInfo: 'NOASSERTION',
    downloadLocation: scan.repoUrl || 'NOASSERTION',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: 'NOASSERTION',
    copyrightText: 'NOASSERTION',
  };

  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: rootSpdxId,
    name: projectName,
    documentNamespace: docNamespace,
    creationInfo: {
      created: now,
      creators: ['Tool: SecureFlow-SCA'],
      licenseListVersion: '3.21',
    },
    packages: [projectPkg, ...packages],
    relationships,
  };
}

// ---------------------------------------------------------------------------
// CycloneDX 1.5 generator
// ---------------------------------------------------------------------------

/**
 * Generate a CycloneDX 1.5 SBOM document in JSON or XML format.
 *
 * @param {object} scan - Mongoose Scan document (lean).
 * @param {Array}  dependencies - Array of Dependency documents (lean).
 * @param {'json'|'xml'} format - Output format (default 'json').
 * @returns {string|object} JSON object or XML string.
 */
export function generateCycloneDX(scan, dependencies, format = 'json') {
  const now = new Date().toISOString();
  const serialNumber = `urn:uuid:${randomUUID()}`;
  const projectName = scan.projectName ?? 'unknown-project';

  const components = dependencies.map((dep) => {
    const licenseId = dep.license || null;
    return {
      type: 'library',
      name: dep.name,
      version: dep.version,
      purl: purl(dep.name, dep.version),
      licenses: licenseId ? [{ license: { id: licenseId } }] : [],
      externalReferences: [
        {
          type: 'distribution',
          url: npmRegistryUrl(dep.name),
        },
      ],
    };
  });

  // Dependency relationships
  const depRelationships = dependencies.map((dep) => {
    const depRef = purl(dep.name, dep.version);
    const dependsOn = dependencies
      .filter((d) => d.parent === dep.name)
      .map((d) => purl(d.name, d.version));
    return { ref: depRef, dependsOn };
  });

  const bomJson = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber,
    version: 1,
    metadata: {
      timestamp: now,
      tools: [
        {
          vendor: 'SecureFlow',
          name: 'SecureFlow-SCA',
          version: '1.0.0',
        },
      ],
      component: {
        type: 'application',
        name: projectName,
        version: 'NOASSERTION',
      },
    },
    components,
    dependencies: depRelationships,
  };

  if (format === 'xml') {
    return buildCycloneDXXml(bomJson);
  }

  return bomJson;
}

// ---------------------------------------------------------------------------
// CycloneDX XML builder (no external library)
// ---------------------------------------------------------------------------

function buildCycloneDXXml(bom) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<bom xmlns="http://cyclonedx.org/schema/bom/1.5" version="${bom.version}" serialNumber="${escapeXml(bom.serialNumber)}">`
  );

  // metadata
  lines.push('  <metadata>');
  lines.push(`    <timestamp>${escapeXml(bom.metadata.timestamp)}</timestamp>`);
  lines.push('    <tools>');
  for (const tool of bom.metadata.tools) {
    lines.push('      <tool>');
    lines.push(`        <vendor>${escapeXml(tool.vendor)}</vendor>`);
    lines.push(`        <name>${escapeXml(tool.name)}</name>`);
    lines.push(`        <version>${escapeXml(tool.version)}</version>`);
    lines.push('      </tool>');
  }
  lines.push('    </tools>');
  lines.push('    <component type="application">');
  lines.push(`      <name>${escapeXml(bom.metadata.component.name)}</name>`);
  lines.push(`      <version>${escapeXml(bom.metadata.component.version)}</version>`);
  lines.push('    </component>');
  lines.push('  </metadata>');

  // components
  lines.push('  <components>');
  for (const comp of bom.components) {
    lines.push(`    <component type="${escapeXml(comp.type)}">`);
    lines.push(`      <name>${escapeXml(comp.name)}</name>`);
    lines.push(`      <version>${escapeXml(comp.version)}</version>`);
    lines.push(`      <purl>${escapeXml(comp.purl)}</purl>`);
    if (comp.licenses && comp.licenses.length > 0) {
      lines.push('      <licenses>');
      for (const l of comp.licenses) {
        if (l.license?.id) {
          lines.push('        <license>');
          lines.push(`          <id>${escapeXml(l.license.id)}</id>`);
          lines.push('        </license>');
        }
      }
      lines.push('      </licenses>');
    }
    if (comp.externalReferences && comp.externalReferences.length > 0) {
      lines.push('      <externalReferences>');
      for (const ref of comp.externalReferences) {
        lines.push(`        <reference type="${escapeXml(ref.type)}">`);
        lines.push(`          <url>${escapeXml(ref.url)}</url>`);
        lines.push('        </reference>');
      }
      lines.push('      </externalReferences>');
    }
    lines.push('    </component>');
  }
  lines.push('  </components>');

  // dependencies
  if (bom.dependencies && bom.dependencies.length > 0) {
    lines.push('  <dependencies>');
    for (const dep of bom.dependencies) {
      if (dep.dependsOn && dep.dependsOn.length > 0) {
        lines.push(`    <dependency ref="${escapeXml(dep.ref)}">`);
        for (const d of dep.dependsOn) {
          lines.push(`      <dependency ref="${escapeXml(d)}" />`);
        }
        lines.push('    </dependency>');
      } else {
        lines.push(`    <dependency ref="${escapeXml(dep.ref)}" />`);
      }
    }
    lines.push('  </dependencies>');
  }

  lines.push('</bom>');
  return lines.join('\n');
}
