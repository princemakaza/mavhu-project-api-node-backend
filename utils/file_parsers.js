// File: utils/fileParsers.js
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Readable } = require('stream');

class FileParser {
  /**
   * Parse CSV file buffer
   */
  static async parseCSV(buffer, fileName) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(buffer.toString());
      
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          // Process results based on file name content
          const processedData = this.processCSVData(results, fileName);
          resolve(processedData);
        })
        .on('error', reject);
    });
  }

  /**
   * Parse Excel file buffer
   */
  static async parseExcel(buffer, fileName) {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const data = xlsx.utils.sheet_to_json(worksheet);
      
      // Process data based on file name
      return this.processExcelData(data, fileName);
    } catch (error) {
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  /**
   * Parse JSON file buffer
   */
  static async parseJSON(buffer, fileName) {
    try {
      const data = JSON.parse(buffer.toString());
      return this.processJSONData(data, fileName);
    } catch (error) {
      throw new Error(`Failed to parse JSON file: ${error.message}`);
    }
  }

  /**
   * Process CSV data based on content type
   */
  static processCSVData(data, fileName) {
    // Process based on file name content
    if (fileName.includes('sequestration')) {
      return this.processSequestrationCSV(data);
    } else if (fileName.includes('scope1')) {
      return this.processScope1CSV(data);
    } else if (fileName.includes('scope2')) {
      return this.processScope2CSV(data);
    } else if (fileName.includes('scope3')) {
      return this.processScope3CSV(data);
    } else if (fileName.includes('reference')) {
      return this.processReferenceCSV(data);
    }
    
    // Default processing
    return { raw_data: data, source_file: fileName };
  }

  /**
   * Process sequestration CSV data
   */
  static processSequestrationCSV(data) {
    const monthlyData = [];
    const methodologies = [];
    let annualSummary = {};

    data.forEach(row => {
      // Check if row contains methodology data
      if (row['Component'] && row['Method Applied']) {
        methodologies.push({
          component: row['Component'],
          method_applied: row['Method Applied'],
          standard_source: row['Standard / Source'],
          purpose: row['Purpose']
        });
      } else if (row['Month 2024']) {
        // Process monthly data
        monthlyData.push({
          month: row['Month 2024'],
          ndvi_max: parseFloat(row['NDVI Max']) || 0,
          agb_t_per_ha: parseFloat(row['AGB (t/ha)']) || 0,
          bgb_t_per_ha: parseFloat(row['BGB (t/ha)']) || 0,
          biomass_c_t_per_ha: parseFloat(row['Biomass C (tC/ha)']) || 0,
          biomass_co2_t_per_ha: parseFloat(row['Biomass CO₂ (tCO₂/ha)']) || 0,
          biomass_co2_total_t: this.parseNumberWithCommas(row['Biomass CO₂ total (tCO₂, 10729 ha)']),
          delta_biomass_co2_t: this.parseNumberWithCommas(row['Δ Biomass CO₂ (tCO₂/10729 ha)']),
          soc_tc_per_ha: parseFloat(row['SOC (tc/ha)']) || 0,
          soc_co2_t_per_ha: parseFloat(row['SOC CO₂ (tCO₂/ha)']) || 0,
          soc_co2_total_t: this.parseNumberWithCommas(row['SOC CO₂ (tCO₂/10729 ha)']),
          delta_soc_co2_t: this.parseNumberWithCommas(row['Δ SOC CO2 (tCO2/10729 h)']),
          net_co2_stock_t: this.parseNumberWithCommas(row['Net CO₂ Stock (tCO₂/10729 ha)']),
          net_co2_change_t: this.parseNumberWithCommas(row['Net CO₂ change (tCO₂/10729 ha)']),
          meaning: row['Meaning'] || ''
        });

        // Extract annual summary from last row if available
        if (row['Net CO₂ change (tCO₂/10729 ha)'] && !row['Month 2024'].match(/[a-zA-Z]/)) {
          annualSummary = {
            net_co2_change_t: this.parseNumberWithCommas(row['Net CO₂ change (tCO₂/10729 ha)'])
          };
        }
      }
    });

    return {
      monthly_data: monthlyData,
      methodologies: methodologies,
      annual_summary: annualSummary,
      source_file: 'CSV_upload'
    };
  }

  /**
   * Process scope 1 CSV data
   */
  static processScope1CSV(data) {
    const sources = [];
    let total_tco2e_per_ha = 0;

    data.forEach(row => {
      if (row['Source'] && row['Source'].trim() !== '' && !row['Source'].includes('Scope 1 total')) {
        sources.push({
          source: row['Source'].trim(),
          parameter: row['Parameter'] || '',
          unit: row['Unit'] || '',
          annual_per_ha: parseFloat(row['Annual  (per ha)']) || 0,
          emission_factor: row['Emission Factor'] || '',
          ef_number: parseFloat(row['EF (numbers only)']) || 0,
          gwp: parseInt(row['GWP']) || 0,
          tco2e_per_ha_per_year: parseFloat(row['(tCO₂e/ha/year)']) || 0,
          methodological_justification: row['Methodological justification & reference'] || ''
        });
      }

      if (row['Source'] && row['Source'].includes('Scope 1 total')) {
        total_tco2e_per_ha = parseFloat(row['(tCO₂e/ha/year)']) || 0;
      }
    });

    return {
      sources: sources,
      total_tco2e_per_ha: total_tco2e_per_ha,
      total_tco2e: 0 // Will be calculated based on area
    };
  }

  /**
   * Process scope 2 CSV data
   */
  static processScope2CSV(data) {
    // Similar implementation as scope1
    return { sources: [], total_tco2e_per_ha: 0, total_tco2e: 0 };
  }

  /**
   * Process scope 3 CSV data
   */
  static processScope3CSV(data) {
    // Similar implementation as scope1
    return { categories: [], total_tco2e_per_ha: 0, total_tco2e: 0 };
  }

  /**
   * Process reference CSV data
   */
  static processReferenceCSV(data) {
    const emission_factors = [];
    let methodology_statement = '';

    data.forEach((row, index) => {
      if (index === 0 && row['0'] && row['0'].includes('methodologies')) {
        methodology_statement = row['0'];
      } else if (row['1'] && row['1'].trim() !== '') {
        emission_factors.push({
          source: row['1'].trim(),
          activity_data: row['2'] || '',
          default_ef_start: row['3'] || '',
          notes_source: row['4'] || '',
          emission_factor_code: this.extractEmissionFactorCode(row['0']),
          emission_factor_value: this.extractNumericValue(row['3']),
          emission_factor_unit: this.extractUnit(row['3'])
        });
      }
    });

    return {
      methodology_statement: methodology_statement,
      emission_factors: emission_factors,
      global_warming_potentials: {},
      conversion_factors: {}
    };
  }

  /**
   * Process Excel data (similar to CSV but with Excel structure)
   */
  static processExcelData(data, fileName) {
    // Implementation similar to processCSVData
    return this.processCSVData(data, fileName);
  }

  /**
   * Process JSON data
   */
  static processJSONData(data, fileName) {
    // Return data as-is for JSON files
    return {
      ...data,
      source_file: fileName
    };
  }

  /**
   * Helper: Parse numbers with commas
   */
  static parseNumberWithCommas(value) {
    if (!value || value === '#VALUE!' || value.trim() === '') return null;
    return parseFloat(value.toString().replace(/,/g, '')) || null;
  }

  /**
   * Helper: Extract emission factor code
   */
  static extractEmissionFactorCode(text) {
    if (!text) return '';
    const match = text.match(/EF_[\w]+/);
    return match ? match[0] : '';
  }

  /**
   * Helper: Extract numeric value from string
   */
  static extractNumericValue(text) {
    if (!text) return null;
    const match = text.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * Helper: Extract unit from string
   */
  static extractUnit(text) {
    if (!text) return '';
    const match = text.match(/[a-zA-Z]+(?:\/[a-zA-Z]+)*$/);
    return match ? match[0] : '';
  }
}

module.exports = FileParser;